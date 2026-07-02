# Full Example Skill

Complete KSP reference implementation demonstrating all features.

## Features

- Prompt-based behavior
- Tool registration (build, test, deploy)
- Lifecycle hooks (install/run)
- Dependency management (npm/apt)
- MCP server integration
- Memory with retention
- Resources (templates, docs, assets)

## Usage

```bash
kendaliai skill install ./full-example
kendaliai skill info full-example
kendaliai skill test full-example
```

## Structure

```
full-example/
├── skill.yaml
├── prompt.md
├── examples.md
├── README.md
├── CHANGELOG.md
├── LICENSE
├── hooks/
│   ├── pre_install.sh
│   ├── post_install.sh
│   ├── pre_run.sh
│   └── post_run.sh
├── tools/
│   ├── build.sh
│   ├── run-tests.sh
│   └── deploy.sh
└── resources/
    ├── templates/
    ├── docs/
    └── assets/
```
