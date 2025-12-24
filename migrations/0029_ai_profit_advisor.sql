-- AI Insights Tables for Profit Advisor
-- This migration creates tables for storing pre-computed AI insights

-- Table for storing AI-generated insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  insight_type VARCHAR(64) NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  severity VARCHAR(16) NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  is_actionable BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  dismissed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS ai_insights_store_idx ON ai_insights(store_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS ai_insights_type_idx ON ai_insights(insight_type, severity);
CREATE INDEX IF NOT EXISTS ai_insights_product_idx ON ai_insights(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_insights_actionable_idx ON ai_insights(store_id, is_actionable, is_dismissed) WHERE is_actionable = true;

-- Table for tracking AI batch processing runs
CREATE TABLE IF NOT EXISTS ai_batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  stores_processed INTEGER NOT NULL DEFAULT 0,
  insights_generated INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_batch_runs_org_idx ON ai_batch_runs(org_id, created_at DESC);

-- Table for caching product profitability summaries (computed daily)
CREATE TABLE IF NOT EXISTS ai_product_profitability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  period_days INTEGER NOT NULL DEFAULT 30,
  units_sold INTEGER NOT NULL DEFAULT 0,
  total_revenue DECIMAL(14, 2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(14, 4) NOT NULL DEFAULT 0,
  total_profit DECIMAL(14, 2) NOT NULL DEFAULT 0,
  profit_margin DECIMAL(6, 4) NOT NULL DEFAULT 0,
  avg_profit_per_unit DECIMAL(10, 4) NOT NULL DEFAULT 0,
  sale_velocity DECIMAL(10, 4) NOT NULL DEFAULT 0, -- units sold per day
  days_to_stockout INTEGER, -- estimated days until stockout at current velocity
  removal_count INTEGER NOT NULL DEFAULT 0, -- times removed (expired/damaged/etc)
  removal_loss_value DECIMAL(14, 2) NOT NULL DEFAULT 0,
  trend VARCHAR(16) DEFAULT 'stable', -- increasing/decreasing/stable
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, product_id, period_days)
);

CREATE INDEX IF NOT EXISTS ai_product_profitability_store_idx ON ai_product_profitability(store_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS ai_product_profitability_profit_idx ON ai_product_profitability(store_id, total_profit DESC);
CREATE INDEX IF NOT EXISTS ai_product_profitability_velocity_idx ON ai_product_profitability(store_id, sale_velocity DESC);
