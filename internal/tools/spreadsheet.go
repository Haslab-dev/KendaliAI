package tools

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (tr *ToolRegistry) SpreadsheetTools() map[string]ToolDef {
	return map[string]ToolDef{
		"read_sheet": {
			Name:        "read_sheet",
			Description: "Reads a CSV or Excel file and returns data as JSON.",
			Signature:   `{"path": "string"}`,
			Category:    "Spreadsheet",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if path == "" {
					return "error: 'path' is required"
				}

				absPath := path
				if !filepath.IsAbs(absPath) {
					absPath = filepath.Join(tr.workspaceRoot, path)
				}

				file, err := os.Open(absPath)
				if err != nil {
					return fmt.Sprintf("error opening file: %v", err)
				}
				defer file.Close()

				if strings.HasSuffix(strings.ToLower(path), ".csv") {
					reader := csv.NewReader(file)
					records, err := reader.ReadAll()
					if err != nil {
						return fmt.Sprintf("error reading CSV: %v", err)
					}

					var headers []string
					var data []map[string]string
					if len(records) > 0 {
						headers = records[0]
						for _, row := range records[1:] {
							item := make(map[string]string)
							for i, h := range headers {
								if i < len(row) {
									item[h] = row[i]
								}
							}
							data = append(data, item)
						}
					}

					result := map[string]interface{}{
						"headers": headers,
						"rows":    data,
						"count":   len(data),
					}

					b, _ := json.MarshalIndent(result, "", "  ")
					return string(b)
				}

				return `{"error":"unsupported format. Use CSV."}`
			},
		},

		"write_sheet": {
			Name:        "write_sheet",
			Description: "Writes data to a CSV file.",
			Signature:   `{"path": "string", "headers": "array", "rows": "array"}`,
			Category:    "Spreadsheet",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				headers, _ := args["headers"].([]interface{})
				rows, _ := args["rows"].([]interface{})

				if path == "" {
					return "error: 'path' is required"
				}

				absPath := path
				if !filepath.IsAbs(absPath) {
					absPath = filepath.Join(tr.workspaceRoot, path)
				}

				file, err := os.Create(absPath)
				if err != nil {
					return fmt.Sprintf("error creating file: %v", err)
				}
				defer file.Close()

				writer := csv.NewWriter(file)
				defer writer.Flush()

				if headers != nil {
					var headerRow []string
					for _, h := range headers {
						headerRow = append(headerRow, fmt.Sprintf("%v", h))
					}
					writer.Write(headerRow)
				}

				if rows != nil {
					for _, row := range rows {
						var csvRow []string
						switch r := row.(type) {
						case []interface{}:
							for _, cell := range r {
								csvRow = append(csvRow, fmt.Sprintf("%v", cell))
							}
						case map[string]interface{}:
							for _, h := range headers {
								hStr := fmt.Sprintf("%v", h)
								if v, ok := r[hStr]; ok {
									csvRow = append(csvRow, fmt.Sprintf("%v", v))
								} else {
									csvRow = append(csvRow, "")
								}
							}
						}
						writer.Write(csvRow)
					}
				}

				return fmt.Sprintf(`{"path":"%s","status":"written"}`, path)
			},
		},

		"csv_to_json": {
			Name:        "csv_to_json",
			Description: "Converts a CSV file to JSON format.",
			Signature:   `{"path": "string"}`,
			Category:    "Spreadsheet",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				path, _ := args["path"].(string)
				if path == "" {
					return "error: 'path' is required"
				}

				absPath := path
				if !filepath.IsAbs(absPath) {
					absPath = filepath.Join(tr.workspaceRoot, path)
				}

				file, err := os.Open(absPath)
				if err != nil {
					return fmt.Sprintf("error opening file: %v", err)
				}
				defer file.Close()

				reader := csv.NewReader(file)
				records, err := reader.ReadAll()
				if err != nil {
					return fmt.Sprintf("error reading CSV: %v", err)
				}

				if len(records) == 0 {
					return `{"data":[]}`
				}

				headers := records[0]
				var data []map[string]interface{}
				for _, row := range records[1:] {
					item := make(map[string]interface{})
					for i, h := range headers {
						if i < len(row) {
							item[h] = row[i]
						}
					}
					data = append(data, item)
				}

				b, _ := json.MarshalIndent(data, "", "  ")
				return string(b)
			},
		},

		"json_to_csv": {
			Name:        "json_to_csv",
			Description: "Converts JSON data to CSV format.",
			Signature:   `{"data": "array", "path": "string"}`,
			Category:    "Spreadsheet",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				data, _ := args["data"].([]interface{})
				path, _ := args["path"].(string)

				if len(data) == 0 {
					return "error: 'data' array is required"
				}

				var headers []string
				var csvRows [][]string

				for i, item := range data {
					if m, ok := item.(map[string]interface{}); ok {
						var row []string
						for k, v := range m {
							if i == 0 {
								headers = append(headers, k)
							}
							row = append(row, fmt.Sprintf("%v", v))
						}
						csvRows = append(csvRows, row)
					}
				}

				if path != "" {
					absPath := path
					if !filepath.IsAbs(absPath) {
						absPath = filepath.Join(tr.workspaceRoot, path)
					}

					file, _ := os.Create(absPath)
					writer := csv.NewWriter(file)
					defer file.Close()
					defer writer.Flush()

					writer.Write(headers)
					for _, row := range csvRows {
						writer.Write(row)
					}

					return fmt.Sprintf(`{"path":"%s","rows":%d}`, path, len(csvRows))
				}

				var buf strings.Builder
				w := csv.NewWriter(&buf)
				w.Write(headers)
				for _, row := range csvRows {
					w.Write(row)
				}
				w.Flush()

				return buf.String()
			},
		},
	}
}
