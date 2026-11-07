import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export interface LayoutProps {
  aoSair: () => void;
  children?: React.ReactNode;
}

export function Layout({ aoSair, children }: LayoutProps) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-fundo text-texto flex">
      <Sidebar aoSair={aoSair} />
      <main className="flex-1 min-w-0 h-screen overflow-y-auto p-6 md:p-8 lg:p-10">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
