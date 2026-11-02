import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export interface LayoutProps {
  aoSair: () => void;
  children?: React.ReactNode;
}

export function Layout({ aoSair, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-fundo text-texto flex">
      <Sidebar aoSair={aoSair} />
      <main className="flex-1 min-w-0 p-8 overflow-y-auto">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
