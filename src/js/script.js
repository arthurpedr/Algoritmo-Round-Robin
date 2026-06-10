import { QUANTUM, IO_POOL, COLORS } from "../constants/cont.jsx";
/**
 * Contador global de PIDs (Process IDs).
 * Começa em 6, assumindo que os PIDs de 1 a 5 são reservados
 * para processos iniciais definidos estaticamente.
 * @type {number}
 */
let nextPid = 6;

/**
 * Retorna o próximo PID disponível e incrementa o contador global.
 *
 * @returns {number} O próximo PID único.
 */
export function getNextPid() {
  return nextPid++;
}

// ── Criar processo ─────────────────────────────────────

/**
 * Constrói um objeto de processo a partir de um template,
 * adicionando os campos de controle necessários para o escalonador.
 *
 * @param {Object} template - Dados base do processo.
 * @param {string} template.id - Identificador único (ex: "P6").
 * @param {string} template.name - Nome do processo (ex: "nginx").
 * @param {number} template.burst - Tempo total de CPU necessário (burst time).
 * @param {number} template.priority - Prioridade do processo.
 * @param {number} template.memory - Memória requerida em MB.
 * @param {string} template.color - Cor para exibição na UI.
 * @param {number} [template.arrivalTime=0] - Instante de chegada na fila.
 *
 * @returns {Object} Processo completo, pronto para entrar na fila de prontos.
 */
export function buildProcess(template) {
  return {
    ...template,
    remaining: template.burst,   // Tempo restante de CPU (decrementado a cada tick)
    quantumUsed: 0,               // Quantos ticks do quantum atual já foram consumidos
    arrivalTime: template.arrivalTime ?? 0,
    waitTime: 0,                  // Tempo acumulado aguardando na fila de prontos
  };
}

/**
 * Gera e retorna um novo processo aleatório com um dos perfis pré-definidos
 * (vim, ffmpeg, nginx, postgres), usando o instante atual do clock como
 * tempo de chegada.
 *
 * @param {number} clock - Tick atual do simulador, usado como arrivalTime.
 * @returns {Object} Novo processo pronto para ser inserido na fila.
 */
export function addRandomProcess(clock) {
  const templates = [
    { name: "vim",      burst: Math.ceil(Math.random() * 15) + 3,  priority: 2, memory: Math.ceil(Math.random() * 60)  + 20 },
    { name: "ffmpeg",   burst: Math.ceil(Math.random() * 25) + 10, priority: 3, memory: Math.ceil(Math.random() * 100) + 50 },
    { name: "nginx",    burst: Math.ceil(Math.random() * 8)  + 2,  priority: 1, memory: Math.ceil(Math.random() * 40)  + 15 },
    { name: "postgres", burst: Math.ceil(Math.random() * 20) + 5,  priority: 2, memory: Math.ceil(Math.random() * 80)  + 40 },
  ];

  const t = templates[Math.floor(Math.random() * templates.length)];

  // Captura o PID uma única vez para evitar duplo incremento,
  // já que tanto o id quanto a cor dependem do mesmo valor.
  const pid = getNextPid();
  const color = COLORS[pid % COLORS.length];

  return buildProcess({
    ...t,
    id: `P${pid}`,
    color,
    arrivalTime: clock,
  });
}

// ── Alocação de memória ────────────────────────────────

/**
 * Calcula os segmentos de memória ocupados pelos processos fornecidos
 * e adiciona um segmento "Livre" com o espaço restante, se houver.
 * Usado para renderizar o mapa de memória na UI.
 *
 * @param {Object[]} processes - Lista de processos ativos (running + ready + blocked).
 * @param {number} total - Capacidade total de memória disponível (em MB).
 *
 * @returns {Object[]} Array de segmentos de memória, cada um com:
 *   - `id`    {string} Identificador do processo ou "Livre".
 *   - `size`  {number} Tamanho do segmento em MB.
 *   - `color` {string} Cor para renderização.
 */
export function allocMemory(processes, total) {
  const segs = processes.map((p) => ({
    id: p.id,
    size: p.memory,
    color: p.color,
  }));

  const used = segs.reduce((s, p) => s + p.size, 0);
  const free = total - used;

  if (free > 0) {
    segs.push({ id: "Livre", size: free, color: "#2A2A3E" });
  }

  return segs;
}

// ── Promover processo ──────────────────────────────────

/**
 * Remove o primeiro processo da fila de prontos e o retorna como
 * próximo processo a executar, zerando seu `quantumUsed`.
 * Implementa a política FIFO de seleção (First-In, First-Out).
 *
 * @param {Object[]} queue - Fila de processos prontos.
 * @returns {{ next: Object|null, rest: Object[] }}
 *   - `next`: Processo promovido (ou `null` se a fila estiver vazia).
 *   - `rest`: Fila remanescente após a remoção.
 */
export function promote(queue) {
  if (queue.length === 0) return { next: null, rest: [] };

  const [next, ...rest] = queue;

  return {
    next: { ...next, quantumUsed: 0 },
    rest,
  };
}

// ── Tick do sistema (principal) ────────────────────────

/**
 * Executa um único tick do escalonador Round-Robin, avançando o estado
 * do sistema em uma unidade de tempo.
 *
 * Ordem de operações por tick:
 *  1. Incrementa `waitTime` de todos os processos na fila de prontos.
 *  2. Decrementa o contador de I/O dos processos bloqueados; os que
 *     concluíram a operação voltam para a fila de prontos.
 *  3. Se há um processo rodando:
 *     a. Decrementa `remaining` e incrementa `quantumUsed`.
 *     b. Se `remaining` chega a 0 → processo termina.
 *     c. Se `quantumUsed` atinge `QUANTUM` → preempção:
 *        com 30% de chance vai para I/O (blocked), senão volta à fila.
 *     d. Caso contrário, continua rodando.
 *  4. Se a CPU estava ociosa e há processos prontos → promove o próximo.
 *
 * @param {Object} state - Estado atual do simulador.
 * @param {Object|null}  state.running         - Processo em execução (ou null).
 * @param {Object[]}     state.readyQueue       - Fila de processos prontos.
 * @param {Object[]}     state.blocked          - Processos aguardando I/O.
 * @param {Object[]}     state.finished         - Processos concluídos.
 * @param {number}       state.contextSwitches  - Total de trocas de contexto.
 * @param {number}       state.cpuBusy          - Ticks com a CPU ocupada.
 *
 * @returns {{
 *   newRunning:    Object|null,
 *   newReady:      Object[],
 *   newBlocked:    Object[],
 *   newFinished:   Object[],
 *   newCS:         number,
 *   newCpuBusy:    number
 * }} Novo estado do sistema após o tick.
 */
export function runTick(state) {
  const { running, readyQueue, blocked, finished, contextSwitches, cpuBusy } =
    state;

  let newRunning = running;
  // Incrementa o tempo de espera de todos na fila de prontos
  let newReady = readyQueue.map((p) => ({
    ...p,
    waitTime: p.waitTime + 1,
  }));
  let newBlocked = blocked;
  let newFinished = finished;
  let newCS = contextSwitches;
  let newCpuBusy = cpuBusy;

  // ── Passo 1: Desbloquear processos que concluíram I/O ────────────────
  const unblocked = [];

  newBlocked = newBlocked.reduce((acc, p) => {
    const left = p.ioLeft - 1;

    if (left <= 0) {
      // I/O concluído → retorna à fila de prontos com quantum zerado
      unblocked.push({ ...p, quantumUsed: 0 });
    } else {
      acc.push({ ...p, ioLeft: left });
    }

    return acc;
  }, []);

  if (unblocked.length > 0) {
    newReady = [...newReady, ...unblocked];
  }

  // ── Passo 2: Executar o processo atual (ou promover se CPU ociosa) ───
  if (newRunning) {
    newCpuBusy++;

    const remaining = newRunning.remaining - 1;
    const quantumUsed = newRunning.quantumUsed + 1;

    if (remaining <= 0) {
      // ── Caso A: Processo terminou ──────────────────────────────
      newFinished = [...newFinished, { ...newRunning, remaining: 0 }];
      newCS++;

      const { next, rest } = promote(newReady);
      newRunning = next;
      newReady = rest;

    } else if (quantumUsed >= QUANTUM) {
      // ── Caso B: Quantum esgotado → preempção ───────────────────
      const goIO = Math.random() < 0.3; // 30% de chance de ir para I/O

      if (goIO) {
        // Sorteia uma operação de I/O aleatória do pool configurado
        const io = IO_POOL[Math.floor(Math.random() * IO_POOL.length)];

        newBlocked = [
          ...newBlocked,
          {
            ...newRunning,
            remaining,
            ioOp: io.op,           // Nome da operação (ex: "disk read")
            ioLeft: io.duration,   // Ticks restantes de I/O
          },
        ];
      } else {
        // Retorna à fila de prontos (Round-Robin padrão)
        newReady = [
          ...newReady,
          { ...newRunning, remaining, quantumUsed: 0 },
        ];
      }

      newCS++;

      const { next, rest } = promote(newReady);
      newRunning = next;
      newReady = rest;

    } else {
      // ── Caso C: Continua executando no mesmo quantum ───────────
      newRunning = {
        ...newRunning,
        remaining,
        quantumUsed,
      };
    }

  } else if (newReady.length > 0) {
    // ── CPU estava ociosa: promove o próximo processo disponível ────────
    newCS++;

    const { next, rest } = promote(newReady);
    newRunning = next;
    newReady = rest;
  }

  return {
    newRunning,
    newReady,
    newBlocked,
    newFinished,
    newCS,
    newCpuBusy,
  };
}