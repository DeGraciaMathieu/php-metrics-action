# PHP Metrics Action

This action analyzes PHP files in pull requests and generates metrics.

## Inputs

| Input         | Description                   | Required |
|---------------|-------------------------------|----------|
| `php-version` | The PHP version to use        | true     |
| `github-token`| GitHub Token for authentication | true     |

## Example Usage

```yaml
name: Analyze PHP Files

on: [pull_request]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Run PHP Metrics Action
        uses: degraciamathieu/php-metrics-action@v1
        with:
          php-version: '8.1'
          github-token: ${{ secrets.GITHUB_TOKEN }}
