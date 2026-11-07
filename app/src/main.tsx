import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

interface State {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch() {
    // Registra falha na montagem caso ocorra
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FBF7F9] text-[#3A2E36] p-8 flex flex-col items-center justify-center font-sans">
          <div className="max-w-lg w-full bg-white border border-[#E9BFD5] rounded-2xl p-6 shadow-md space-y-4">
            <h1 className="text-xl font-bold text-[#AC6E87]">
              Ops! Ocorreu um erro ao carregar o aplicativo
            </h1>
            <p className="text-base text-[#92798F]">
              {this.state.error?.message || "Ocorreu um erro inesperado."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[#AC6E87] text-white font-semibold rounded-xl text-base hover:opacity-95 transition"
            >
              Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
