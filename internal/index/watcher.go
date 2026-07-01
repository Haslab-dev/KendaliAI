package index

import (
	"context"
	"log"
	"sync"

	"github.com/fsnotify/fsnotify"
)

const SymFile SymbolType = "file"

type RepositoryWatcher struct {
	watcher   *fsnotify.Watcher
	codeGraph *CodeIntelligenceGraph
	mu        sync.Mutex
}

func NewRepositoryWatcher(cg *CodeIntelligenceGraph) (*RepositoryWatcher, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	return &RepositoryWatcher{
		watcher:   watcher,
		codeGraph: cg,
	}, nil
}

func (rw *RepositoryWatcher) Start(ctx context.Context, path string) error {
	err := rw.watcher.Add(path)
	if err != nil {
		return err
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				rw.watcher.Close()
				return
			case event, ok := <-rw.watcher.Events:
				if !ok {
					return
				}
				if event.Has(fsnotify.Write) {
					log.Printf("file modified: %s. Re-indexing symbol graph.", event.Name)
					rw.codeGraph.AddSymbol(event.Name, SymFile, event.Name)
				}
			case err, ok := <-rw.watcher.Errors:
				if !ok {
					return
				}
				log.Printf("watcher error: %v", err)
			}
		}
	}()

	return nil
}
