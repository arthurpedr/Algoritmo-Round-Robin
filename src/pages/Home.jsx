import { useState, useEffect, useRef } from "react";

import {
  INITIAL_PROCESSES,
  TOTAL_MEMORY,
  COLORS,
  EMPTY_FORM,
  QUANTUM,
  IO_POOL,
} from "../constants/cont.jsx";

import {
  buildProcess,
  allocMemory,
  runTick,
  getNextPid,
  addRandomProcess,
} from "../js/script.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-[#1A1A2E] border border-[#0F3460] text-[#F0F4F8] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#4A9FFF] placeholder-[#4A5568]";

function prioLabel(priority) {
  const map = {
    1: { label: "Alta",   cls: "bg-[#FF6B6B]/20 text-[#FF6B6B]"   },
    2: { label: "Média",  cls: "bg-[#F5A623]/20 text-[#F5A623]"   },
    3: { label: "Normal", cls: "bg-[#4A9FFF]/20 text-[#4A9FFF]"   },
    4: { label: "Baixa",  cls: "bg-[#8B5CF6]/20 text-[#8B5CF6]"   },
    5: { label: "Mín.",   cls: "bg-[#94A3B8]/20 text-[#94A3B8]"   },
  };
  return map[priority] ?? { label: String(priority), cls: "bg-[#1A1A2E] text-[#94A3B8]" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [clock, setClock] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1000);

  const [running, setRunning] = useState(null);
  const [readyQueue, setReadyQueue] = useState(
    INITIAL_PROCESSES.map(buildProcess),
  );
  const [blocked, setBlocked] = useState([]);
  const [finished, setFinished] = useState([]);

  const [contextSwitches, setContextSwitches] = useState(0);
  const [cpuBusy, setCpuBusy] = useState(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState("");

  // ── Derived state ───────────────────────────────────────────────────────────

  const allActive = [
    ...(running ? [running] : []),
    ...readyQueue,
    ...blocked,
  ];

  const memSegs = allocMemory(allActive, TOTAL_MEMORY);
  const usedMemory = allActive.reduce((s, p) => s + p.memory, 0);

  const cpuUtil = clock > 0 ? Math.round((cpuBusy / clock) * 100) : 0;
  const throughput =
    clock > 0 ? (finished.length / clock).toFixed(2) : "0.00";
  const avgWait =
    readyQueue.length > 0
      ? Math.round(
          readyQueue.reduce((s, p) => s + p.waitTime, 0) / readyQueue.length,
        )
      : 0;

  // ── Refs ────────────────────────────────────────────────────────────────────

  const stateRef = useRef({});
  stateRef.current = {
    running,
    readyQueue,
    blocked,
    finished,
    contextSwitches,
    cpuBusy,
  };

  // ── Simulation tick ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      const result = runTick(stateRef.current);

      setClock((c) => c + 1);
      setRunning(result.newRunning);
      setReadyQueue(result.newReady);
      setBlocked(result.newBlocked);
      setFinished(result.newFinished);
      setContextSwitches(result.newCS);
      setCpuBusy(result.newCpuBusy);
    }, speed);

    return () => clearInterval(id);
  }, [isRunning, speed]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const addRandom = () => {
    const newProcess = addRandomProcess(clock);
    setReadyQueue((q) => [...q, newProcess]);
  };

  const submitForm = () => {
    const burst = parseInt(form.burst, 10);
    const memory = parseInt(form.memory, 10);
    const priority = parseInt(form.priority, 10);

    if (!form.name.trim()) {
      setFormError("Informe um nome para o processo.");
      return;
    }
    if (!burst || burst < 1 || burst > 999) {
      setFormError("Burst deve ser entre 1 e 999 ms.");
      return;
    }
    if (!memory || memory < 1 || memory >= TOTAL_MEMORY) {
      setFormError(`Memória deve ser entre 1 e ${TOTAL_MEMORY - 1} MB.`);
      return;
    }
    if (usedMemory + memory > TOTAL_MEMORY) {
      setFormError("Memória insuficiente para alocar o processo.");
      return;
    }

    const pid = `P${getNextPid()}`;
    const color = COLORS[parseInt(pid.slice(1), 10) % COLORS.length];

    const newProcess = buildProcess({
      id: pid,
      name: form.name.trim(),
      burst,
      priority,
      memory,
      color,
      arrivalTime: clock,
    });

    setReadyQueue((q) => [...q, newProcess]);
    setShowModal(false);
    setFormError("");
    setForm(EMPTY_FORM);
  };

  const killRunning = () => {
    if (!running) return;
    setRunning(null);
  };

  const killFromReady = (id) => {
    setReadyQueue((q) => q.filter((p) => p.id !== id));
  };

  const killFromBlocked = (id) => {
    setBlocked((b) => b.filter((p) => p.id !== id));
  };

  const changePriority = (id, delta) => {
    setReadyQueue((q) =>
      q.map((p) =>
        p.id === id
          ? { ...p, priority: Math.min(5, Math.max(1, p.priority + delta)) }
          : p,
      ),
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#1A1A2E] text-[#F0F4F8] font-mono p-4 text-sm">
      {/* ── MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#16213E] border border-[#0F3460] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[#4A9FFF] font-bold text-base tracking-wide">
                Novo Processo
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setFormError("");
                  setForm(EMPTY_FORM);
                }}
                className="text-[#94A3B8] hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[#94A3B8] text-xs mb-1 block">
                  Nome do processo
                </label>
                <input
                  className={inputCls}
                  placeholder="ex: my_app"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#94A3B8] text-xs mb-1 block">
                    Burst (ms)
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min="1"
                    max="999"
                    placeholder="ex: 12"
                    value={form.burst}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, burst: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-[#94A3B8] text-xs mb-1 block">
                    Memória (MB)
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min="1"
                    max={TOTAL_MEMORY - 1}
                    placeholder="ex: 64"
                    value={form.memory}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, memory: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-[#94A3B8] text-xs mb-1 block">
                  Prioridade
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      onClick={() =>
                        setForm((f) => ({ ...f, priority: String(v) }))
                      }
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                        form.priority === String(v)
                          ? "bg-[#4A9FFF] border-[#4A9FFF] text-black"
                          : "bg-[#1A1A2E] border-[#0F3460] text-[#94A3B8] hover:border-[#4A9FFF]"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {formError && (
                <p className="text-[#FF6B6B] text-xs bg-[#FF6B6B]/10 border border-[#FF6B6B]/30 rounded-lg px-3 py-2">
                  ⚠ {formError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setFormError("");
                    setForm(EMPTY_FORM);
                  }}
                  className="flex-1 border border-[#0F3460] text-[#94A3B8] hover:text-white py-2 rounded-lg text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitForm}
                  className="flex-1 bg-[#4A9FFF] text-black font-bold py-2 rounded-lg text-xs hover:bg-[#3a8fe0] transition"
                >
                  Adicionar à Fila
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex flex-wrap justify-between items-center mb-4 border border-[#0F3460] px-5 py-3 rounded-xl bg-[#16213E] gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-wide">
            OS Simulator
          </h1>
          <p className="text-[#94A3B8] text-xs">
            Round Robin · Quantum = {QUANTUM}ms
          </p>
        </div>

        <div className="flex items-center gap-2 text-[#22D3EE] font-medium">
          <span className="w-2 h-2 rounded-full bg-[#22D3EE] animate-pulse inline-block" />
          t = {clock}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[#94A3B8] text-xs">Velocidade</label>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-[#1A1A2E] border border-[#0F3460] text-[#F0F4F8] text-xs rounded px-2 py-1"
          >
            <option value={2000}>0.5×</option>
            <option value={1000}>1×</option>
            <option value={500}>2×</option>
            <option value={200}>5×</option>
          </select>

          <button
            onClick={() => setIsRunning(true)}
            disabled={isRunning}
            className="bg-[#00D9A3] disabled:opacity-40 text-black px-4 py-1 rounded-lg text-xs font-semibold"
          >
            ▶ Run
          </button>
          <button
            onClick={() => setIsRunning(false)}
            disabled={!isRunning}
            className="bg-[#F5A623] disabled:opacity-40 text-black px-4 py-1 rounded-lg text-xs font-semibold"
          >
            ⏸ Pause
          </button>
          <button
            onClick={addRandom}
            className="border border-[#4A9FFF]/50 text-[#4A9FFF] px-3 py-1 rounded-lg text-xs font-semibold hover:bg-[#4A9FFF]/10 transition"
          >
            + Aleatório
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#4A9FFF] text-black px-3 py-1 rounded-lg text-xs font-semibold hover:bg-[#3a8fe0] transition"
          >
            + Manual
          </button>
        </div>
      </div>

      {/* ── TOP GRID ── */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* CPU */}
        <div className="bg-[#16213E] border border-[#00D9A3]/40 p-4 rounded-xl">
          <div className="flex justify-between items-center mb-3">
            <p className="text-[#00D9A3] text-xs uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00D9A3] animate-pulse" />
              CPU — Em execução
            </p>
            {running && (
              <button
                onClick={killRunning}
                title="Matar processo em execução"
                className="text-[#FF6B6B] text-xs border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 hover:bg-[#FF6B6B]/20 px-2 py-0.5 rounded transition"
              >
                ✕ Kill
              </button>
            )}
          </div>

          {running ? (
            <div className="border border-[#00D9A3]/30 bg-[#00D9A3]/5 p-4 rounded-lg text-center">
              <p className="text-3xl text-[#00D9A3] font-bold">{running.id}</p>
              <p className="text-[#94A3B8] text-xs mt-1">{running.name}</p>
              <div className="flex justify-around mt-3 text-xs text-[#94A3B8]">
                <span>
                  Prio <span className="text-white">{running.priority}</span>
                </span>
                <span>
                  Rest <span className="text-white">{running.remaining}ms</span>
                </span>
                <span>
                  Quantum{" "}
                  <span className="text-[#22D3EE]">
                    {running.quantumUsed}/{QUANTUM}
                  </span>
                </span>
              </div>
              <div className="mt-3">
                <p className="text-[10px] text-[#94A3B8] mb-1 text-left">
                  Quantum
                </p>
                <div className="bg-[#1A1A2E] rounded-full h-2">
                  <div
                    className="bg-[#22D3EE] h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(running.quantumUsed / QUANTUM) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-[10px] text-[#94A3B8] mb-1 text-left">
                  Burst restante
                </p>
                <div className="bg-[#1A1A2E] rounded-full h-2">
                  <div
                    className="bg-[#00D9A3] h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(running.remaining / running.burst) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-[#0F3460] p-6 rounded-lg text-center text-[#94A3B8]">
              <p className="text-2xl mb-1">—</p>
              <p className="text-xs">CPU IDLE</p>
            </div>
          )}
        </div>

        {/* Fila de prontos */}
        <div className="bg-[#16213E] border border-[#0F3460] p-4 rounded-xl">
          <p className="text-[#4A9FFF] text-xs uppercase tracking-widest mb-3">
            Fila de Prontos ({readyQueue.length})
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {readyQueue.length === 0 && (
              <p className="text-[#94A3B8] text-xs text-center py-4">
                Fila vazia
              </p>
            )}
            {readyQueue.map((p, i) => {
              const { label, cls } = prioLabel(p.priority);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-[#1A1A2E] px-3 py-2 rounded-lg border border-[#0F3460]"
                >
                  <span className="text-[#94A3B8] text-[10px] w-4">
                    {i + 1}
                  </span>
                  <span className="text-[#4A9FFF] font-bold w-8">{p.id}</span>
                  <span className="flex-1 truncate text-xs">{p.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${cls}`}>
                    {label}
                  </span>
                  <span className="text-[#94A3B8] text-[10px] w-10 text-right">
                    {p.remaining}ms
                  </span>
                  <button
                    onClick={() => changePriority(p.id, 1)}
                    className="text-[#94A3B8] hover:text-white text-xs w-4"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => changePriority(p.id, -1)}
                    className="text-[#94A3B8] hover:text-white text-xs w-4"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => killFromReady(p.id)}
                    title="Remover processo"
                    className="text-[#FF6B6B]/60 hover:text-[#FF6B6B] text-xs w-4 transition"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bloqueados I/O */}
        <div className="bg-[#16213E] border border-[#0F3460] p-4 rounded-xl">
          <p className="text-[#F5A623] text-xs uppercase tracking-widest mb-3">
            Bloqueados / I·O ({blocked.length})
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {blocked.length === 0 && (
              <p className="text-[#94A3B8] text-xs text-center py-4">
                Nenhum processo bloqueado
              </p>
            )}
            {blocked.map((p) => (
              <div
                key={p.id}
                className="bg-[#1A1A2E] px-3 py-2 rounded-lg border border-[#F5A623]/30"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[#F5A623] font-bold text-sm">
                    {p.id}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[#F5A623] text-[10px]">
                      {p.ioLeft}ms ⏱
                    </span>
                    <button
                      onClick={() => killFromBlocked(p.id)}
                      title="Remover processo"
                      className="text-[#FF6B6B]/60 hover:text-[#FF6B6B] text-xs transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <p className="text-[#94A3B8] text-[10px] mt-0.5">
                  {p.name} · {p.ioOp}
                </p>
                <div className="bg-[#1A1A2E] rounded-full h-1 mt-2 border border-[#0F3460]">
                  <div
                    className="bg-[#F5A623] h-1 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        (p.ioLeft /
                          (IO_POOL.find((x) => x.op === p.ioOp)?.duration ||
                            10)) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM GRID ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Memória */}
        <div className="col-span-2 bg-[#16213E] border border-[#0F3460] p-4 rounded-xl">
          <p className="text-[#8B5CF6] text-xs uppercase tracking-widest mb-3">
            Gerenciamento de Memória — {TOTAL_MEMORY} MB
          </p>
          <div className="flex h-8 rounded-lg overflow-hidden border border-[#0F3460]">
            {memSegs.map((seg) => (
              <div
                key={seg.id}
                style={{
                  width: `${(seg.size / TOTAL_MEMORY) * 100}%`,
                  backgroundColor: seg.color,
                }}
                className="flex items-center justify-center text-[10px] font-bold overflow-hidden transition-all duration-700"
                title={`${seg.id}: ${seg.size}MB`}
              >
                {seg.size / TOTAL_MEMORY > 0.08 ? seg.id : ""}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {memSegs.map((seg) => (
              <div
                key={seg.id}
                className="flex items-center gap-1.5 text-[10px] text-[#94A3B8]"
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{ backgroundColor: seg.color }}
                />
                {seg.id} · {seg.size}MB
              </div>
            ))}
          </div>
          <div className="flex gap-6 mt-3 pt-3 border-t border-[#0F3460] text-xs">
            <div>
              <p className="text-[#94A3B8] text-[10px]">Usado</p>
              <p className="text-[#8B5CF6] font-semibold">
                {usedMemory} MB ({Math.round((usedMemory / TOTAL_MEMORY) * 100)}
                %)
              </p>
            </div>
            <div>
              <p className="text-[#94A3B8] text-[10px]">Livre</p>
              <p className="text-white font-semibold">
                {TOTAL_MEMORY - usedMemory} MB
              </p>
            </div>
            <div>
              <p className="text-[#94A3B8] text-[10px]">Processos na memória</p>
              <p className="text-white font-semibold">{allActive.length}</p>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="bg-[#16213E] border border-[#0F3460] p-4 rounded-xl">
          <p className="text-[#00D9A3] text-xs uppercase tracking-widest mb-3">
            Estatísticas
          </p>
          <div className="space-y-2">
            {[
              {
                label: "Processos ativos",
                val: allActive.length,
                color: "#4A9FFF",
              },
              { label: "Concluídos", val: finished.length, color: "#00D9A3" },
              { label: "Bloqueados", val: blocked.length, color: "#F5A623" },
              {
                label: "Trocas de contexto",
                val: contextSwitches,
                color: "#22D3EE",
              },
              {
                label: "Throughput",
                val: `${throughput} proc/tick`,
                color: "#22D3EE",
              },
              {
                label: "Uso de CPU",
                val: `${cpuUtil}%`,
                color: running ? "#00D9A3" : "#FF6B6B",
              },
              {
                label: "Espera média (fila)",
                val: `${avgWait} ticks`,
                color: "#94A3B8",
              },
            ].map(({ label, val, color }) => (
              <div
                key={label}
                className="flex justify-between items-center py-1.5 border-b border-[#0F3460] last:border-0"
              >
                <span className="text-[#94A3B8] text-[11px]">{label}</span>
                <span className="font-semibold text-[11px]" style={{ color }}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FINISHED ── */}
      {finished.length > 0 && (
        <div className="mt-4 bg-[#16213E] border border-[#0F3460] p-4 rounded-xl">
          <p className="text-[#00D9A3] text-xs uppercase tracking-widest mb-3">
            Processos Finalizados ({finished.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {finished.map((p) => (
              <div
                key={p.id + p.arrivalTime}
                className="flex items-center gap-2 bg-[#1A1A2E] border border-[#6B7280]/30 px-3 py-1.5 rounded-lg"
              >
                <span className="text-[#6B7280] font-bold text-xs">{p.id}</span>
                <span className="text-[#94A3B8] text-[10px]">{p.name}</span>
                <span className="text-[#00D9A3] text-[10px]">✓</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}