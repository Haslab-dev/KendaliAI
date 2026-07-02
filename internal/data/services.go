package data

import (
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/vector"
)

type DataLayer struct {
	Sessions *SessionService
	Goals    *GoalService
	Memory   *MemoryService
	Storage  *SQLiteDataLayer

	closeFuncs []func() error
	root       string
}

type MemoryService struct {
	Store    *SQLiteDataLayer
	Vector   vector.VectorStore
	Embedder embedding.EmbeddingProvider
}

type SessionService struct {
	db *SQLiteDataLayer
}

type GoalService struct {
	db *SQLiteDataLayer
}
