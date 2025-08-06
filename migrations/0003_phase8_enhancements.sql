-- Phase 8 Enhancements Migration
-- Real-time notifications, offline sync, and AI analytics

-- Create notification types enum
CREATE TYPE notification_type AS ENUM (
  'inventory_alert',
  'sales_update', 
  'system_alert',
  'ai_insight',
  'low_stock',
  'payment_alert',
  'user_activity'
);

-- Create notification priority enum
CREATE TYPE notification_priority AS ENUM (
  'low',
  'medium', 
  'high',
  'critical'
);

-- Create sync status enum
CREATE TYPE sync_status AS ENUM (
  'pending',
  'syncing',
  'synced',
  'failed',
  'conflict'
);

-- Create AI model types enum
CREATE TYPE ai_model_type AS ENUM (
  'linear',
  'arima',
  'prophet',
  'lstm',
  'ensemble',
  'xgboost',
  'random_forest'
);

-- Create AI insight types enum
CREATE TYPE ai_insight_type AS ENUM (
  'forecast',
  'anomaly',
  'recommendation',
  'trend',
  'pattern',
  'optimization'
);

-- Create AI insight severity enum
CREATE TYPE ai_insight_severity AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type notification_type NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB,
  priority notification_priority DEFAULT 'medium',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notification preferences table
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, store_id, type)
);

-- Sync queue table for offline operations
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  action VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  status sync_status DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI models table
CREATE TABLE ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  model_type ai_model_type NOT NULL,
  parameters JSONB,
  accuracy DECIMAL(5,4),
  is_active BOOLEAN DEFAULT TRUE,
  version VARCHAR(20) DEFAULT '1.0.0',
  training_data_size INTEGER,
  last_trained TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI insights table
CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  insight_type ai_insight_type NOT NULL,
  severity ai_insight_severity DEFAULT 'medium',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  data JSONB,
  actionable BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT FALSE,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- WebSocket connections tracking
CREATE TABLE websocket_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  connection_id VARCHAR(255) UNIQUE NOT NULL,
  user_agent TEXT,
  ip_address INET,
  is_active BOOLEAN DEFAULT TRUE,
  connected_at TIMESTAMP DEFAULT NOW(),
  disconnected_at TIMESTAMP,
  last_activity TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_notifications_store_id ON notifications(store_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_unread ON notifications(is_read) WHERE is_read = FALSE;

CREATE INDEX idx_notification_preferences_user_store ON notification_preferences(user_id, store_id);
CREATE INDEX idx_notification_preferences_type ON notification_preferences(type);

CREATE INDEX idx_sync_queue_store_id ON sync_queue(store_id);
CREATE INDEX idx_sync_queue_user_id ON sync_queue(user_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at);
CREATE INDEX idx_sync_queue_pending ON sync_queue(status) WHERE status = 'pending';

CREATE INDEX idx_ai_models_store_id ON ai_models(store_id);
CREATE INDEX idx_ai_models_type ON ai_models(model_type);
CREATE INDEX idx_ai_models_active ON ai_models(is_active) WHERE is_active = TRUE;

CREATE INDEX idx_ai_insights_store_id ON ai_insights(store_id);
CREATE INDEX idx_ai_insights_type ON ai_insights(insight_type);
CREATE INDEX idx_ai_insights_severity ON ai_insights(severity);
CREATE INDEX idx_ai_insights_unread ON ai_insights(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_ai_insights_created_at ON ai_insights(created_at);

CREATE INDEX idx_websocket_connections_user_id ON websocket_connections(user_id);
CREATE INDEX idx_websocket_connections_store_id ON websocket_connections(store_id);
CREATE INDEX idx_websocket_connections_active ON websocket_connections(is_active) WHERE is_active = TRUE;

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notifications_updated_at 
  BEFORE UPDATE ON notifications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at 
  BEFORE UPDATE ON notification_preferences 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_queue_updated_at 
  BEFORE UPDATE ON sync_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_models_updated_at 
  BEFORE UPDATE ON ai_models 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_insights_updated_at 
  BEFORE UPDATE ON ai_insights 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification preferences for existing users
INSERT INTO notification_preferences (user_id, store_id, type, enabled, email_enabled, push_enabled, in_app_enabled)
SELECT 
  u.id as user_id,
  s.id as store_id,
  nt.type,
  TRUE as enabled,
  TRUE as email_enabled,
  TRUE as push_enabled,
  TRUE as in_app_enabled
FROM users u
CROSS JOIN stores s
CROSS JOIN (SELECT unnest(enum_range(NULL::notification_type)) as type) nt
WHERE u.store_id = s.id OR u.role = 'admin';

-- Create views for common queries
CREATE VIEW unread_notifications_count AS
SELECT 
  user_id,
  store_id,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE priority = 'critical') as critical_count
FROM notifications 
WHERE is_read = FALSE 
GROUP BY user_id, store_id;

CREATE VIEW pending_sync_items AS
SELECT 
  store_id,
  entity_type,
  COUNT(*) as pending_count,
  MAX(created_at) as oldest_pending
FROM sync_queue 
WHERE status = 'pending' 
GROUP BY store_id, entity_type;

CREATE VIEW ai_insights_summary AS
SELECT 
  store_id,
  insight_type,
  severity,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE is_read = FALSE) as unread_count,
  AVG(confidence_score) as avg_confidence
FROM ai_insights 
GROUP BY store_id, insight_type, severity; 