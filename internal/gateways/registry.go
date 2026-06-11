package gateways

import (
	"database/sql"
)

type Gateway struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Provider       string `json:"provider"`
	DefaultModel   string `json:"default_model"`
	Status         string `json:"status"`
	WorkspaceOnly  int    `json:"workspace_only"`
}

func ListGateways(db *sql.DB) ([]Gateway, error) {
	rows, err := db.Query("SELECT id, name, provider, default_model, status, workspace_only FROM gateways")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Gateway
	for rows.Next() {
		var g Gateway
		if err := rows.Scan(&g.ID, &g.Name, &g.Provider, &g.DefaultModel, &g.Status, &g.WorkspaceOnly); err != nil {
			return nil, err
		}
		result = append(result, g)
	}

	return result, nil
}
