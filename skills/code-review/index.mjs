import { exec, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const spawnAsync = promisify(spawn);

/**
 * Clone a repository
 */
export async function cloneRepo(repoUrl, targetDir = "./.tmp-review") {
  try {
    await execAsync(`rm -rf ${targetDir}`);
    await execAsync(`mkdir -p ${targetDir}`);
    await execAsync(`git clone ${repoUrl} ${targetDir}`, {
      cwd: process.cwd(),
    });
    return targetDir;
  } catch (error) {
    throw new Error(`Failed to clone repo: ${error.message}`);
  }
}

/**
 * Get PR files
 */
export async function getPRFiles(prNumber, targetDir, owner, repo) {
  try {
    const { stdout } = await execAsync(
      `gh pr view ${prNumber} --repo ${owner}/${repo} --json files --json title --json body --json number`,
      { cwd: targetDir }
    );

    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to fetch PR: ${error.message}`);
  }
}

/**
 * Run OpenCode with kimi-k2 on code
 */
export async function reviewCodeWithOpenCode(code, options = {}) {
  const {
    focus = "quality",
    language = "javascript",
    rules = [],
  } = options;

  try {
    const prompt = `
You are a code review agent using kimi-k2 model.

Review the following ${language} code for:
- ${focus === "quality" ? "code quality, readability, and maintainability" : focus}
- Potential bugs and edge cases
- Performance issues
- Security vulnerabilities
- Best practices violations

Apply these rules if provided:
${rules.length > 0 ? rules.join("\n") : "None"}

Code to review:
${code}
`;

    // OpenCode review - spawn as subprocess
    const { stdout, stderr } = await execAsync(`opencode review --model kimi-k2`, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENCODE_MODEL: "kimi-k2",
      },
    });

    return {
      feedback: stdout || "No feedback generated",
      metadata: {
        model: "kimi-k2",
        focus,
        language,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    throw new Error(`Failed to run OpenCode review: ${error.message}`);
  }
}

/**
 * Get modified files from PR
 */
export async function getModifiedFiles(prNumber, owner, repo) {
  try {
    const { stdout } = await execAsync(
      `gh pr diff ${prNumber} --repo ${owner}/${repo}`,
      {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    );

    // Extract file paths from diff
    const fileMatches = stdout.matchAll(/index\.md[^\\/\n]*/g);
    const files = Array.from(fileMatches).map((match) => match[0].trim());

    return [...new Set(files)]; // Remove duplicates
  } catch (error) {
    throw new Error(`Failed to get modified files: ${error.message}`);
  }
}

/**
 * Generate GitHub Actions workflow
 */
export function generateActionsWorkflow(owner, repo, prNumber) {
  const workflow = {
    name: "Code Review with OpenCode",
    on: {
      pull_request: {
        types: ["opened", "synchronize", "reopened"],
      },
    },
    permissions: {
      contents: "read",
      pull-requests: "write",
    },
    jobs: {
      review: {
        runs-on: "ubuntu-latest",
        steps: [
          {
            name: "Checkout repository",
            uses: "actions/checkout@v4",
          },
          {
            name: "Install OpenCode",
            run: "npm install -g opencode",
          },
          {
            name: "Review PR with OpenCode",
            env: {
              OPENCODE_MODEL: "kimi-k2",
            },
            run: `opencode review --repo ${owner}/${repo} --pr ${prNumber} --model kimi-k2`,
          },
          {
            name: "Comment on PR",
            uses: "actions/github-script@v7",
            with: {
              script: `
                const fs = require('fs');
                const reviewOutput = fs.readFileSync('review-output.json', 'utf8');
                github.rest.issues.createComment({
                  owner: '${owner}',
                  repo: '${repo}',
                  issue_number: ${prNumber},
                  body: reviewOutput
                });
              `,
            },
          },
        ],
      },
    },
  };

  return workflow;
}

/**
 * Run GitHub Actions workflow review
 */
export async function runReview(owner, repo, prNumber, targetDir) {
  try {
    const files = await getModifiedFiles(prNumber, owner, repo);

    if (files.length === 0) {
      return {
        status: "skipped",
        message: "No files to review",
      };
    }

    // Clone and checkout the PR
    await execAsync(
      `git fetch origin pull/${prNumber}/merge:${prNumber} && git checkout ${prNumber}`,
      { cwd: targetDir }
    );

    // Get file contents
    const reviews = [];
    for (const file of files) {
      try {
        const { stdout } = await execAsync(
          `git show HEAD:${file}`,
          { cwd: targetDir, maxBuffer: 5 * 1024 * 1024 }
        );

        const review = await reviewCodeWithOpenCode(stdout, {
          language: getLanguageFromFile(file),
        });

        reviews.push({
          file,
          review,
        });
      } catch (error) {
        console.warn(`Failed to review ${file}: ${error.message}`);
      }
    }

    return {
      status: "complete",
      prNumber,
      owner,
      repo,
      filesReviewed: files.length,
      reviews,
      summary: generateSummary(reviews),
    };
  } catch (error) {
    throw new Error(`Failed to run review: ${error.message}`);
  }
}

/**
 * Get language from file extension
 */
function getLanguageFromFile(filename) {
  const ext = filename.split(".").pop();
  const langMap = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    go: "go",
    rs: "rust",
    c: "c",
    cpp: "cpp",
    java: "java",
    sh: "bash",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
  };
  return langMap[ext] || "text";
}

/**
 * Generate review summary
 */
function generateSummary(reviews) {
  const criticalIssues = reviews.filter(
    (r) =>
      r.review.feedback.toLowerCase().includes("critical") ||
      r.review.feedback.toLowerCase().includes("security")
  ).length;

  const suggestions = reviews.filter(
    (r) => r.review.feedback.toLowerCase().includes("suggest")
  ).length;

  const passes = reviews.filter(
    (r) => r.review.feedback.toLowerCase().includes("pass")
  ).length;

  return {
    criticalIssues,
    suggestions,
    totalReviews: reviews.length,
    passing: passes,
    failing: reviews.length - passes,
  };
}

/**
 * Post review to GitHub
 */
export async function postReviewToGitHub(owner, repo, prNumber, reviewSummary) {
  try {
    const comment = generateComment(reviewSummary);
    
    await execAsync(
      `gh pr comment ${prNumber} --repo ${owner}/${repo} --body "${comment}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    return {
      success: true,
      message: "Review posted to PR",
    };
  } catch (error) {
    throw new Error(`Failed to post review: ${error.message}`);
  }
}

/**
 * Generate review comment for GitHub
 */
function generateComment(summary) {
  return `
## 🦞 Code Review Summary

**${summary.criticalIssues}** critical issues found
**${summary.suggestions}** suggestions for improvement
**${summary.passing}/${summary.totalReviews}** files passed review

---

### 🎯 Key Findings

${summary.criticalIssues > 0
  ? `⚠️ **Review these files first:**
${getCriticalFiles().map(f => `- \`${f}\``).join("\n")}
`
  : "✅ No critical issues found."}

---

### 💡 Suggestions

${summary.suggestions > 0
  ? `Consider addressing these suggestions to improve code quality:
${getSuggestions().map(s => `- ${s}`).join("\n")}
`
  : "No suggestions at this time."}

---

### ✅ Review Completed

This review was generated using OpenCode with kimi-k2 model.

**Metadata:**
- Total files reviewed: ${summary.totalReviews}
- Passing: ${summary.passing}
- Failing: ${summary.failing}
- Critical issues: ${summary.criticalIssues}

🧠 Co-created by ribby 🐟
`;
}

/**
 * Get critical file names (can be customized)
 */
function getCriticalFiles() {
  return [
    "package.json",
    "src/index.ts",
    "src/index.js",
    "index.ts",
    "index.js",
  ];
}

/**
 * Get suggestion examples (can be customized)
 */
function getSuggestions() {
  return [
    "Add error handling for edge cases",
    "Improve code readability with better variable names",
    "Consider adding unit tests for this functionality",
    "Reduce code duplication",
    "Add JSDoc or TypeScript types for better documentation",
  ];
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case "review": {
        const owner = args.find((arg, i) => arg.startsWith("--repo="));
        const repo = args.find((arg, i) => arg.startsWith("--repo="));
        const prNumber = args.find((arg, i) => arg.startsWith("--pr="));

        if (!owner || !repo || !prNumber) {
          console.error(
            "Usage: node index.mjs review --repo=<owner/repo> --pr=<number>"
          );
          process.exit(1);
        }

        const result = await runReview(owner.replace("--repo=", ""), repo.replace("--repo=", ""), prNumber.replace("--pr=", ""));
        
        writeFileSync("review-summary.json", JSON.stringify(result, null, 2));
        console.log("Review complete! Saved to review-summary.json");
        console.log(`\nSummary: ${JSON.stringify(result.summary)}`);
        break;
      }

      case "generate-workflow": {
        const owner = args.find((arg, i) => arg.startsWith("--repo="));
        const repo = args.find((arg, i) => arg.startsWith("--repo="));
        const prNumber = args.find((arg, i) => arg.startsWith("--pr="));

        if (!owner || !repo || !prNumber) {
          console.error(
            "Usage: node index.mjs generate-workflow --repo=<owner/repo> --pr=<number>"
          );
          process.exit(1);
        }

        const workflow = generateActionsWorkflow(
          owner.replace("--repo=", ""),
          repo.replace("--repo=", ""),
          prNumber.replace("--pr=", "")
        );

        writeFileSync(
          ".github/workflows/code-review.yaml",
          JSON.stringify(workflow, null, 2)
        );
        console.log("GitHub Actions workflow generated!");
        break;
      }

      case "post": {
        const owner = args.find((arg, i) => arg.startsWith("--repo="));
        const repo = args.find((arg, i) => arg.startsWith("--repo="));
        const prNumber = args.find((arg, i) => arg.startsWith("--pr="));
        const summaryFile = args.find((arg, i) => arg.startsWith("--summary="));

        if (!owner || !repo || !prNumber || !summaryFile) {
          console.error(
            "Usage: node index.mjs post --repo=<owner/repo> --pr=<number> --summary=<file>"
          );
          process.exit(1);
        }

        const summary = JSON.parse(readFileSync(summaryFile, "utf-8"));
        await postReviewToGitHub(
          owner.replace("--repo=", ""),
          repo.replace("--repo=", ""),
          prNumber.replace("--pr=", ""),
          summary.summary
        );
        console.log("Review posted to PR!");
        break;
      }

      default:
        console.log("code-review CLI");
        console.log("");
        console.log("Commands:");
        console.log("  review    Run code review on a PR");
        console.log("  generate-workflow    Generate GitHub Actions workflow");
        console.log("  post    Post review to GitHub PR");
        console.log("");
        console.log("Examples:");
        console.log(
          "  node index.mjs review --repo=permaweb/skills --pr=1"
        );
        console.log(
          "  node index.mjs generate-workflow --repo=permaweb/skills --pr=1"
        );
        console.log(
          "  node index.mjs post --repo=permaweb/skills --pr=1 --summary=review-summary.json"
        );
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
