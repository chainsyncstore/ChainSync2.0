DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'store_performance_alerts'
          AND column_name = 'comparison_window'
    ) THEN
        ALTER TABLE store_performance_alerts
            ADD COLUMN comparison_window TEXT;
    END IF;

    UPDATE store_performance_alerts
    SET comparison_window = 'previous_7_days'
    WHERE comparison_window IS NULL;

    ALTER TABLE store_performance_alerts
        ALTER COLUMN comparison_window SET DEFAULT 'previous_7_days';

    ALTER TABLE store_performance_alerts
        ALTER COLUMN comparison_window SET NOT NULL;
END
$$;
