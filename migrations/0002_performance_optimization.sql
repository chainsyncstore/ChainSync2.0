-- Performance Optimization Migration
-- Add indexes for better query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS users_store_id_idx ON users(store_id);
CREATE INDEX IF NOT EXISTS users_is_active_idx ON users(is_active);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users(created_at);

-- Products table indexes
CREATE INDEX IF NOT EXISTS products_name_idx ON products(name);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);
CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand);
CREATE INDEX IF NOT EXISTS products_is_active_idx ON products(is_active);
CREATE INDEX IF NOT EXISTS products_created_at_idx ON products(created_at);

-- Inventory table indexes
CREATE INDEX IF NOT EXISTS inventory_store_id_idx ON inventory(store_id);
CREATE INDEX IF NOT EXISTS inventory_product_id_idx ON inventory(product_id);

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS transactions_store_id_idx ON transactions(store_id);
CREATE INDEX IF NOT EXISTS transactions_cashier_id_idx ON transactions(cashier_id);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);

-- Transaction Items table indexes
CREATE INDEX IF NOT EXISTS transaction_items_transaction_id_idx ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS transaction_items_product_id_idx ON transaction_items(product_id);

-- Low Stock Alerts table indexes
CREATE INDEX IF NOT EXISTS low_stock_alerts_store_id_idx ON low_stock_alerts(store_id);
CREATE INDEX IF NOT EXISTS low_stock_alerts_product_id_idx ON low_stock_alerts(product_id);

-- User Store Permissions table indexes
CREATE INDEX IF NOT EXISTS user_store_permissions_user_id_idx ON user_store_permissions(user_id);
CREATE INDEX IF NOT EXISTS user_store_permissions_store_id_idx ON user_store_permissions(store_id);

-- Loyalty Tiers table indexes
CREATE INDEX IF NOT EXISTS loyalty_tiers_store_id_idx ON loyalty_tiers(store_id);

-- Customers table indexes
CREATE INDEX IF NOT EXISTS customers_store_id_idx ON customers(store_id);

-- Loyalty Transactions table indexes
CREATE INDEX IF NOT EXISTS loyalty_transactions_customer_id_idx ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS loyalty_transactions_transaction_id_idx ON loyalty_transactions(transaction_id);

-- IP Whitelists table indexes
CREATE INDEX IF NOT EXISTS ip_whitelists_ip_address_idx ON ip_whitelists(ip_address);
CREATE INDEX IF NOT EXISTS ip_whitelists_whitelisted_by_idx ON ip_whitelists(whitelisted_by);
CREATE INDEX IF NOT EXISTS ip_whitelists_whitelisted_for_idx ON ip_whitelists(whitelisted_for);
CREATE INDEX IF NOT EXISTS ip_whitelists_store_id_idx ON ip_whitelists(store_id);

-- IP Whitelist Logs table indexes
CREATE INDEX IF NOT EXISTS ip_whitelist_logs_ip_address_idx ON ip_whitelist_logs(ip_address);
CREATE INDEX IF NOT EXISTS ip_whitelist_logs_user_id_idx ON ip_whitelist_logs(user_id);

-- Session table indexes
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);

-- Password Reset Tokens table indexes
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens(token);

-- AI Demand Forecasting table indexes
CREATE INDEX IF NOT EXISTS forecast_models_store_id_idx ON forecast_models(store_id);
CREATE INDEX IF NOT EXISTS demand_forecasts_store_id_idx ON demand_forecasts(store_id);
CREATE INDEX IF NOT EXISTS demand_forecasts_product_id_idx ON demand_forecasts(product_id);
CREATE INDEX IF NOT EXISTS demand_forecasts_model_id_idx ON demand_forecasts(model_id);
CREATE INDEX IF NOT EXISTS demand_forecasts_forecast_date_idx ON demand_forecasts(forecast_date);
CREATE INDEX IF NOT EXISTS ai_insights_store_id_idx ON ai_insights(store_id);
CREATE INDEX IF NOT EXISTS seasonal_patterns_store_id_idx ON seasonal_patterns(store_id);
CREATE INDEX IF NOT EXISTS seasonal_patterns_product_id_idx ON seasonal_patterns(product_id);
CREATE INDEX IF NOT EXISTS external_factors_store_id_idx ON external_factors(store_id); 