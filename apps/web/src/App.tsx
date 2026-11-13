import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BasketProvider } from "./context/BasketContext.js";
import { DataProvenanceBanner } from "./components/common/DataProvenanceBanner.js";
import { TopBar } from "./components/common/TopBar.js";
import { Header } from "./components/common/Header.js";
import { Navbar } from "./components/common/Navbar.js";
import { Footer } from "./components/common/Footer.js";
import { PincodeModal } from "./components/common/PincodeModal.js";
import { BrowserOmnibar } from "./components/common/BrowserOmnibar.js";
import { HomePage } from "./pages/HomePage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { ComparisonPage } from "./pages/ComparisonPage.js";
import { GroceryListPage } from "./pages/GroceryListPage.js";
import { OptimizationPage } from "./pages/OptimizationPage.js";
import { HandoffPage } from "./pages/HandoffPage.js";
import { PlatformsPage } from "./pages/PlatformsPage.js";
import { HowItWorksPage } from "./pages/HowItWorksPage.js";

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const [pincodeModalOpen, setPincodeModalOpen] = useState(false);
  const [omnibarOpen, setOmnibarOpen] = useState(false);
  const [omnibarQuery, setOmnibarQuery] = useState("");

  React.useEffect(() => {
    const handleOpen = (e: any) => {
      setOmnibarQuery(e.detail?.query || "");
      setOmnibarOpen(true);
    };
    window.addEventListener("open-browser-omnibar", handleOpen);
    return () => window.removeEventListener("open-browser-omnibar", handleOpen);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BasketProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-white">
            {/* Global data-provenance banner (LIVE / MIXED / MOCK) */}
            <DataProvenanceBanner />

            {/* Top Utility Bar */}
            <TopBar />

            {/* Main Header with Search and Cart Count */}
            <Header
              onOpenPincodeModal={() => setPincodeModalOpen(true)}
              onOpenSearch={(q) => {
                setOmnibarQuery(q || "");
                setOmnibarOpen(true);
              }}
            />

            {/* Sticky Navigation Bar */}
            <Navbar />

            {/* Main Content Area */}
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/compare" element={<ComparisonPage />} />
                <Route path="/compare/:id" element={<ComparisonPage />} />
                <Route path="/list" element={<GroceryListPage />} />
                <Route path="/optimize" element={<OptimizationPage />} />
                <Route path="/optimize/:id" element={<OptimizationPage />} />
                <Route path="/handoff/:id" element={<HandoffPage />} />
                <Route path="/platforms" element={<PlatformsPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            {/* Global Footer */}
            <Footer />

            {/* Pincode & Location Modal */}
            <PincodeModal
              isOpen={pincodeModalOpen}
              onClose={() => setPincodeModalOpen(false)}
            />

            {/* Omnibar Browser Search Modal */}
            <BrowserOmnibar
              isOpen={omnibarOpen}
              onClose={() => setOmnibarOpen(false)}
              initialQuery={omnibarQuery}
            />
          </div>
        </BrowserRouter>
      </BasketProvider>
    </QueryClientProvider>
  );
};
