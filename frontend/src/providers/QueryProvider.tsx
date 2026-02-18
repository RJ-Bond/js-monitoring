"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 10_000 } } })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>{children}</LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
