-- Оптимизация для Time-series данных
ALTER DATABASE js_monitoring CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Индекс для быстрых запросов истории по серверу и времени
-- (GORM AutoMigrate создаёт базовые индексы, но этот составной — для оптимальных range-запросов)
-- Применяется после создания таблиц через AutoMigrate в backend:
-- CREATE INDEX IF NOT EXISTS idx_player_history_server_time
--   ON player_history(server_id, timestamp DESC);
