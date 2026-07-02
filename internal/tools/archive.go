package tools

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func (tr *ToolRegistry) ArchiveTools() map[string]ToolDef {
	return map[string]ToolDef{
		"zip": {
			Name:        "zip",
			Description: "Creates a ZIP archive from files or directories.",
			Signature:   `{"source": "string", "dest": "string"}`,
			Category:    "Archive",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				source, _ := args["source"].(string)
				dest, _ := args["dest"].(string)

				if source == "" {
					return "error: 'source' is required"
				}
				if dest == "" {
					dest = source + ".zip"
				}

				absSource := source
				if !filepath.IsAbs(absSource) {
					absSource = filepath.Join(tr.workspaceRoot, source)
				}
				absDest := dest
				if !filepath.IsAbs(absDest) {
					absDest = filepath.Join(tr.workspaceRoot, dest)
				}

				writer, err := os.Create(absDest)
				if err != nil {
					return fmt.Sprintf("error creating zip: %v", err)
				}
				defer writer.Close()

				zipWriter := zip.NewWriter(writer)
				defer zipWriter.Close()

				count := 0
				filepath.Walk(absSource, func(path string, info os.FileInfo, err error) error {
					if err != nil || info.IsDir() || path == absSource {
						return nil
					}
					relPath, _ := filepath.Rel(absSource, path)
					f, _ := zipWriter.Create(relPath)
					data, _ := os.ReadFile(path)
					f.Write(data)
					count++
					return nil
				})

				return fmt.Sprintf(`{"dest":"%s","files":%d}`, dest, count)
			},
		},

		"unzip": {
			Name:        "unzip",
			Description: "Extracts a ZIP archive to a destination directory.",
			Signature:   `{"source": "string", "dest": "string"}`,
			Category:    "Archive",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				source, _ := args["source"].(string)
				dest, _ := args["dest"].(string)

				if source == "" {
					return "error: 'source' is required"
				}
				if dest == "" {
					dest = strings.TrimSuffix(source, ".zip")
				}

				absSource := source
				if !filepath.IsAbs(absSource) {
					absSource = filepath.Join(tr.workspaceRoot, source)
				}
				absDest := dest
				if !filepath.IsAbs(absDest) {
					absDest = filepath.Join(tr.workspaceRoot, dest)
				}

				if err := os.MkdirAll(absDest, 0755); err != nil {
					return fmt.Sprintf("error creating dest dir: %v", err)
				}

				reader, err := zip.OpenReader(absSource)
				if err != nil {
					return fmt.Sprintf("error opening zip: %v", err)
				}
				defer reader.Close()

				count := 0
				for _, f := range reader.File {
					outPath := filepath.Join(absDest, f.Name)
					if f.FileInfo().IsDir() {
						os.MkdirAll(outPath, f.Mode())
						continue
					}
					os.MkdirAll(filepath.Dir(outPath), 0755)
					outFile, _ := os.OpenFile(outPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
					inFile, _ := f.Open()
					io.Copy(outFile, inFile)
					outFile.Close()
					inFile.Close()
					count++
				}

				return fmt.Sprintf(`{"dest":"%s","files":%d}`, dest, count)
			},
		},

		"tar": {
			Name:        "tar",
			Description: "Creates a tar.gz archive from files or directories.",
			Signature:   `{"source": "string", "dest": "string", "compress": "boolean"}`,
			Category:    "Archive",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				source, _ := args["source"].(string)
				dest, _ := args["dest"].(string)
				compress := true
				if c, ok := args["compress"].(bool); ok {
					compress = c
				}

				if source == "" {
					return "error: 'source' is required"
				}
				if dest == "" {
					if compress {
						dest = source + ".tar.gz"
					} else {
						dest = source + ".tar"
					}
				}

				absSource := source
				if !filepath.IsAbs(absSource) {
					absSource = filepath.Join(tr.workspaceRoot, source)
				}
				absDest := dest
				if !filepath.IsAbs(absDest) {
					absDest = filepath.Join(tr.workspaceRoot, dest)
				}

				var cmd *exec.Cmd
				if compress {
					cmd = exec.Command("tar", "-czf", absDest, "-C", filepath.Dir(absSource), filepath.Base(absSource))
				} else {
					cmd = exec.Command("tar", "-cf", absDest, "-C", filepath.Dir(absSource), filepath.Base(absSource))
				}

				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("tar error: %v", err)
				}

				return fmt.Sprintf(`{"dest":"%s"}`, dest)
			},
		},

		"extract_tar": {
			Name:        "extract_tar",
			Description: "Extracts a tar.gz or tar archive.",
			Signature:   `{"source": "string", "dest": "string"}`,
			Category:    "Archive",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				source, _ := args["source"].(string)
				dest, _ := args["dest"].(string)

				if source == "" {
					return "error: 'source' is required"
				}
				if dest == "" {
					dest = "."
				}

				absSource := source
				if !filepath.IsAbs(absSource) {
					absSource = filepath.Join(tr.workspaceRoot, source)
				}
				absDest := dest
				if !filepath.IsAbs(absDest) {
					absDest = filepath.Join(tr.workspaceRoot, dest)
				}

				if err := os.MkdirAll(absDest, 0755); err != nil {
					return fmt.Sprintf("error creating dest: %v", err)
				}

				var cmd *exec.Cmd
				if strings.HasSuffix(source, ".gz") || strings.HasSuffix(source, ".tgz") {
					cmd = exec.Command("tar", "-xzf", absSource, "-C", absDest)
				} else {
					cmd = exec.Command("tar", "-xf", absSource, "-C", absDest)
				}

				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("extract error: %v", err)
				}

				return fmt.Sprintf(`{"dest":"%s"}`, dest)
			},
		},

		"compress": {
			Name:        "compress",
			Description: "Compresses a file using gzip.",
			Signature:   `{"source": "string", "dest": "string"}`,
			Category:    "Archive",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				source, _ := args["source"].(string)
				dest, _ := args["dest"].(string)

				if source == "" {
					return "error: 'source' is required"
				}
				if dest == "" {
					dest = source + ".gz"
				}

				absSource := source
				if !filepath.IsAbs(absSource) {
					absSource = filepath.Join(tr.workspaceRoot, source)
				}
				absDest := dest
				if !filepath.IsAbs(absDest) {
					absDest = filepath.Join(tr.workspaceRoot, dest)
				}

				cmd := exec.Command("gzip", "-k", "-f", absSource)
				if err := cmd.Run(); err != nil {
					return fmt.Sprintf("compress error: %v", err)
				}

				return fmt.Sprintf(`{"dest":"%s"}`, dest)
			},
		},
	}
}
