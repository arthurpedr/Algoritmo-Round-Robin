// constants.jsx

export const QUANTUM = 4;
export const TOTAL_MEMORY = 512;

export const INITIAL_PROCESSES = [
  { id: "P1", name: "bash",          burst: 7,  priority: 1, memory: 77,  color: "#4A9FFF" },
  { id: "P2", name: "chrome",        burst: 10, priority: 3, memory: 102, color: "#00D9A3" },
  { id: "P3", name: "compiler",      burst: 20, priority: 2, memory: 153, color: "#8B5CF6" },
  { id: "P4", name: "node_server",   burst: 5,  priority: 2, memory: 51,  color: "#F5A623" },
  { id: "P5", name: "python_script", burst: 9,  priority: 1, memory: 64,  color: "#FF6B6B" },
];

export const IO_POOL = [
  { op: "Leitura disco",  duration: 8  },
  { op: "Aguarda rede",   duration: 15 },
  { op: "Escrita disco",  duration: 6  },
  { op: "Input teclado",  duration: 4  },
];

export const COLORS = [
  "#4A9FFF","#00D9A3","#8B5CF6","#F5A623","#FF6B6B",
  "#22D3EE","#A78BFA","#F472B6","#34D399","#FB923C",
];

export const EMPTY_FORM = {
  name: "",
  burst: "",
  priority: "2",
  memory: ""
};