package index

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
)

type LanguageIndexer interface {
	Parse(path string) error
}

type WorkspaceIndexer struct {
	graph    *CodeIntelligenceGraph
	indexers map[string]LanguageIndexer
}

func NewWorkspaceIndexer(cg *CodeIntelligenceGraph) *WorkspaceIndexer {
	wi := &WorkspaceIndexer{
		graph:    cg,
		indexers: make(map[string]LanguageIndexer),
	}
	wi.indexers[".go"] = &GoIndexer{graph: cg}
	return wi
}

func (wi *WorkspaceIndexer) RegisterIndexer(ext string, indexer LanguageIndexer) {
	wi.indexers[ext] = indexer
}

func (wi *WorkspaceIndexer) IndexFile(path string) error {
	ext := filepath.Ext(path)
	indexer, exists := wi.indexers[ext]
	if !exists {
		wi.graph.AddSymbol(filepath.Base(path), SymImport, path)
		return nil
	}
	return indexer.Parse(path)
}

type GoIndexer struct {
	graph *CodeIntelligenceGraph
}

func (gi *GoIndexer) Parse(path string) error {
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return err
	}

	ast.Inspect(node, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.FuncDecl:
			funcName := x.Name.Name
			gi.graph.AddSymbol(funcName, SymFunction, path)
		case *ast.TypeSpec:
			typeName := x.Name.Name
			gi.graph.AddSymbol(typeName, SymStruct, path)
		case *ast.ImportSpec:
			if x.Path != nil {
				gi.graph.AddSymbol(x.Path.Value, SymImport, path)
			}
		}
		return true
	})

	return nil
}
