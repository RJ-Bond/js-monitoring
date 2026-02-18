package poller

import (
	"log"
	"sync"
	"time"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

const (
	workerCount         = 50
	emptyPollInterval   = 60 * time.Second
	activePollInterval  = 10 * time.Second
	schedulerTick       = 5 * time.Second
	historyFlushTick    = 30 * time.Second
	batchSize           = 100
)

type pollJob struct {
	server models.Server
}

type pollResult struct {
	serverID uint
	status   *models.ServerStatus
}

// Poller — конкурентный опросчик серверов через Worker Pool
type Poller struct {
	jobs     chan pollJob
	results  chan pollResult
	done     chan struct{}
	wg       sync.WaitGroup

	historyBuf []models.PlayerHistory
	historyMu  sync.Mutex

	OnUpdate func(serverID uint, status *models.ServerStatus)
}

func New(onUpdate func(serverID uint, status *models.ServerStatus)) *Poller {
	return &Poller{
		jobs:     make(chan pollJob, 2000),
		results:  make(chan pollResult, 2000),
		done:     make(chan struct{}),
		OnUpdate: onUpdate,
	}
}

// Start запускает воркеры, обработчик результатов и планировщик
func (p *Poller) Start() {
	for i := 0; i < workerCount; i++ {
		p.wg.Add(1)
		go p.worker()
	}
	go p.processResults()
	go p.batchHistoryWriter()
	go p.scheduler()

	log.Printf("[Poller] started with %d workers", workerCount)
}

// Stop корректно завершает поллер
func (p *Poller) Stop() {
	close(p.done)
	p.wg.Wait()
	p.flushHistoryBuffer()
	log.Println("[Poller] stopped")
}

// worker — один воркер из пула; берёт задание из канала и опрашивает сервер
func (p *Poller) worker() {
	defer p.wg.Done()
	for {
		select {
		case job := <-p.jobs:
			status := p.query(&job.server)
			p.results <- pollResult{serverID: job.server.ID, status: status}
		case <-p.done:
			return
		}
	}
}

// query выбирает протокол и возвращает результат опроса
func (p *Poller) query(srv *models.Server) *models.ServerStatus {
	var status *models.ServerStatus
	var err error

	switch srv.GameType {
	case "minecraft":
		status, err = QueryMinecraft(srv.IP, srv.Port)
	default: // source, fivem
		status, err = QuerySource(srv.IP, srv.Port)
	}

	if err != nil {
		return &models.ServerStatus{
			ServerID:     srv.ID,
			OnlineStatus: false,
			LastUpdate:   time.Now(),
		}
	}

	status.ServerID = srv.ID
	status.LastUpdate = time.Now()
	return status
}

// processResults сохраняет статус в БД и уведомляет WebSocket клиентов
func (p *Poller) processResults() {
	for {
		select {
		case res := <-p.results:
			if res.status == nil {
				continue
			}

			// Upsert: обновить или создать запись статуса
			database.DB.Save(res.status)

			// Добавить в буфер истории
			p.historyMu.Lock()
			p.historyBuf = append(p.historyBuf, models.PlayerHistory{
				ServerID:  res.serverID,
				Count:     res.status.PlayersNow,
				Timestamp: time.Now(),
			})
			p.historyMu.Unlock()

			// Уведомить WebSocket клиентов
			if p.OnUpdate != nil {
				p.OnUpdate(res.serverID, res.status)
			}

		case <-p.done:
			return
		}
	}
}

// batchHistoryWriter периодически сбрасывает буфер истории в БД одним запросом
func (p *Poller) batchHistoryWriter() {
	ticker := time.NewTicker(historyFlushTick)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.flushHistoryBuffer()
		case <-p.done:
			return
		}
	}
}

func (p *Poller) flushHistoryBuffer() {
	p.historyMu.Lock()
	if len(p.historyBuf) == 0 {
		p.historyMu.Unlock()
		return
	}
	batch := make([]models.PlayerHistory, len(p.historyBuf))
	copy(batch, p.historyBuf)
	p.historyBuf = p.historyBuf[:0]
	p.historyMu.Unlock()

	if err := database.DB.CreateInBatches(batch, batchSize).Error; err != nil {
		log.Printf("[Poller] batch history insert error: %v", err)
	} else {
		log.Printf("[Poller] flushed %d history records", len(batch))
	}
}

// scheduler — Smart Poller: адаптирует интервал опроса в зависимости от активности
func (p *Poller) scheduler() {
	ticker := time.NewTicker(schedulerTick)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			var servers []models.Server
			database.DB.Preload("Status").Find(&servers)

			now := time.Now()
			for _, srv := range servers {
				s := srv

				// Выбираем интервал: пустой сервер → 1 мин, активная игра → 10 сек
				interval := emptyPollInterval
				if s.Status != nil && s.Status.PlayersNow > 0 {
					interval = activePollInterval
				}

				// Нужен ли новый опрос?
				if s.Status == nil || now.Sub(s.Status.LastUpdate) >= interval {
					select {
					case p.jobs <- pollJob{server: s}:
					default:
						// Канал переполнен — пропускаем этот цикл
					}
				}
			}

		case <-p.done:
			return
		}
	}
}
