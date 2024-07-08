const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const phpVersion = core.getInput('php-version');
    const token = core.getInput('github-token');
    const context = github.context;

    // Checkout the code
    await exec.exec('git', ['checkout', context.ref]);

    // Set PHP version
    await exec.exec('sh', ['-c', `curl -sSL https://packages.sury.org/php/apt.gpg | sudo apt-key add - && echo "deb https://packages.sury.org/php/ $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/php.list && sudo apt-get update && sudo apt-get install -y php${phpVersion} php${phpVersion}-cli php${phpVersion}-xml php${phpVersion}-mbstring`]);
    
    // Install composer dependencies
    await exec.exec('composer', ['update', '--quiet', '--no-ansi', '--no-interaction', '--no-scripts', '--no-suggest', '--no-progress', '--prefer-dist']);

    // Get the list of modified and added PHP files
    const pr = context.payload.pull_request;
    if (!pr) {
      core.setFailed('This action can only be run on pull requests');
      return;
    }

    const octokit = github.getOctokit(token);
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pr.number,
    });

    const modifiedFiles = files
      .filter(file => file.status === 'modified')
      .map(file => file.filename)
      .filter(file => file.endsWith('.php'))
      .join(' ');

    const addedFiles = files
      .filter(file => file.status === 'added')
      .map(file => file.filename)
      .filter(file => file.endsWith('.php'))
      .join(' ');

    // Run PHP Metrics on modified and added files
    if (modifiedFiles) {
      await exec.exec('vendor/bin/phpmetrics', ['--report-cli', modifiedFiles, '>', '.github/workflows/phpmetrics_output_modified.txt']);
    } else {
      core.info("No PHP files modified in this pull request.");
      fs.writeFileSync('.github/workflows/phpmetrics_output_modified.txt', 'No PHP files modified in this pull request.');
    }

    if (addedFiles) {
      await exec.exec('vendor/bin/phpmetrics', ['--report-cli', addedFiles, '>', '.github/workflows/phpmetrics_output_added.txt']);
    } else {
      core.info("No PHP files added in this pull request.");
      fs.writeFileSync('.github/workflows/phpmetrics_output_added.txt', 'No PHP files added in this pull request.');
    }

    // Extract and format metrics for modified files
    let metricsModified = '';
    if (fs.existsSync('.github/workflows/phpmetrics_output_modified.txt')) {
      const outputModified = fs.readFileSync('.github/workflows/phpmetrics_output_modified.txt', 'utf8');
      const locmMatch = outputModified.match(/Lack of cohesion of methods\s+(\d+)/);
      const acccMatch = outputModified.match(/Average Cyclomatic complexity by class\s+(\d+)/);

      const locm = locmMatch ? locmMatch[1] : 'N/A';
      const accc = acccMatch ? acccMatch[1] : 'N/A';

      metricsModified = `## Metrics for Modified Files\n| Metric | Value |\n| ------ | ----- |\n| Lack of cohesion of methods | ${locm} |\n| Average Cyclomatic complexity by class | ${accc} |\n`;
    } else {
      metricsModified = 'No metrics found for modified files.';
    }
    fs.writeFileSync('.github/workflows/phpmetrics_results_modified.md', metricsModified);

    // Extract and format metrics for added files
    let metricsAdded = '';
    if (fs.existsSync('.github/workflows/phpmetrics_output_added.txt')) {
      const outputAdded = fs.readFileSync('.github/workflows/phpmetrics_output_added.txt', 'utf8');
      const locmMatch = outputAdded.match(/Lack of cohesion of methods\s+(\d+)/);
      const acccMatch = outputAdded.match(/Average Cyclomatic complexity by class\s+(\d+)/);

      const locm = locmMatch ? locmMatch[1] : 'N/A';
      const accc = acccMatch ? acccMatch[1] : 'N/A';

      metricsAdded = `## Metrics for Added Files\n| Metric | Value |\n| ------ | ----- |\n| Lack of cohesion of methods | ${locm} |\n| Average Cyclomatic complexity by class | ${accc} |\n`;
    } else {
      metricsAdded = 'No metrics found for added files.';
    }
    fs.writeFileSync('.github/workflows/phpmetrics_results_added.md', metricsAdded);

    // Combine results
    let combinedResults = '## PHP Metrics Analysis Results\n\n';
    combinedResults += fs.readFileSync('.github/workflows/phpmetrics_results_modified.md', 'utf8') + '\n\n';
    combinedResults += fs.readFileSync('.github/workflows/phpmetrics_results_added.md', 'utf8') + '\n\n';
    combinedResults += '## Details\n- [LCOM](https://global-exam.slite.com/app/docs/KMS5I08Eh_guxb?noteModalId=fbQf78FpLY_wH4)\n- [CCN](https://global-exam.slite.com/app/docs/KMS5I08Eh_guxb?noteModalId=THWZNC68rXAY9R)\n';
    fs.writeFileSync('.github/workflows/phpmetrics_results.md', combinedResults);

    // Comment on the PR
    const resultComment = fs.readFileSync('.github/workflows/phpmetrics_results.md', 'utf8');
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: pr.number,
      body: resultComment,
    });

  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();
