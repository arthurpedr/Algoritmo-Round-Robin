import { QUANTUM, IO_POOL, COLORS } from "../constants/cont.jsx";

// PID global
let nextPid = 6;

export function getNextPid() {
  return nextPid++;
}

// ── Criar processo ─────────────────────────────────────
export function buildProcess(template) {
  return {
    ...template,
    remaining: template.burst,
    quantumUsed: 0,
    arrivalTime: template.arrivalTime ?? 0,
    waitTime: 0,
  };
}

export function addRandomProcess(clock) {
  const templates = [
    { name: "vim",      burst: Math.ceil(Math.random() * 15) + 3,  priority: 2, memory: Math.ceil(Math.random() * 60)  + 20 },
    { name: "ffmpeg",   burst: Math.ceil(Math.random() * 25) + 10, priority: 3, memory: Math.ceil(Math.random() * 100) + 50 },
    { name: "nginx",    burst: Math.ceil(Math.random() * 8)  + 2,  priority: 1, memory: Math.ceil(Math.random() * 40)  + 15 },
    { name: "postgres", burst: Math.ceil(Math.random() * 20) + 5,  priority: 2, memory: Math.ceil(Math.random() * 80)  + 40 },
  ];

  const t = templates[Math.floor(Math.random() * templates.length)];

  // Capture PID once — avoids double-increment (color + id both using getNextPid)
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
export function promote(queue) {
  if (queue.length === 0) return { next: null, rest: [] };

  const [next, ...rest] = queue;

  return {
    next: { ...next, quantumUsed: 0 },
    rest,
  };
}

// ── Tick do sistema (principal) ────────────────────────
export function runTick(state) {
  const { running, readyQueue, blocked, finished, contextSwitches, cpuBusy } =
    state;

  let newRunning = running;
  let newReady = readyQueue.map((p) => ({
    ...p,
    waitTime: p.waitTime + 1,
  }));
  let newBlocked = blocked;
  let newFinished = finished;
  let newCS = contextSwitches;
  let newCpuBusy = cpuBusy;

  // desbloqueio de I/O
  const unblocked = [];

  newBlocked = newBlocked.reduce((acc, p) => {
    const left = p.ioLeft - 1;

    if (left <= 0) {
      unblocked.push({ ...p, quantumUsed: 0 });
    } else {
      acc.push({ ...p, ioLeft: left });
    }

    return acc;
  }, []);

  if (unblocked.length > 0) {
    newReady = [...newReady, ...unblocked];
  }

  // execução
  if (newRunning) {
    newCpuBusy++;

    const remaining = newRunning.remaining - 1;
    const quantumUsed = newRunning.quantumUsed + 1;

    if (remaining <= 0) {
      // processo terminou
      newFinished = [...newFinished, { ...newRunning, remaining: 0 }];
      newCS++;

      const { next, rest } = promote(newReady);
      newRunning = next;
      newReady = rest;
    } else if (quantumUsed >= QUANTUM) {
      // quantum esgotado
      const goIO = Math.random() < 0.3;

      if (goIO) {
        const io = IO_POOL[Math.floor(Math.random() * IO_POOL.length)];

        newBlocked = [
          ...newBlocked,
          {
            ...newRunning,
            remaining,
            ioOp: io.op,
            ioLeft: io.duration,
          },
        ];
      } else {
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
      // continua rodando
      newRunning = {
        ...newRunning,
        remaining,
        quantumUsed,
      };
    }
  } else if (newReady.length > 0) {
    // CPU estava idle, promove próximo
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