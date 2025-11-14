import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import DashboardCards from "../../client/src/components/analytics/dashboard-cards";

const money = (amount: number, currency: "USD" | "NGN" = "NGN") => ({ amount, currency });

describe("DashboardCards", () => {
  it("renders monetary values using Money inputs", () => {
    render(
      <DashboardCards
        dailySales={{ revenue: money(150), transactions: 3 }}
        profitLoss={{
          revenue: money(320),
          cost: money(120),
          profit: money(200),
        }}
        popularProducts={[
          {
            product: { id: "prod-1", name: "Widget", price: "500", currency: "NGN" },
            salesCount: 7,
          },
        ]}
        additionalMetrics={{ totalProducts: 24, totalCustomers: 80 }}
      />
    );

    expect(screen.getByText("₦150.00")).toBeInTheDocument();
    expect(screen.getByText("₦200.00")).toBeInTheDocument();
    expect(screen.getByText("₦320.00")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });
});
