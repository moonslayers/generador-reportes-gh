import axios from 'axios';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Cargar configuración de repos
const config = require('../config.json');

// === CONFIGURACIÓN desde .env ===
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER;

if (!GITHUB_TOKEN || !GITHUB_USER) {
    console.error('❌ Faltan variables de entorno. Verifica el archivo .env');
    process.exit(1);
}

const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
};

// === FUNCIONES ===
async function getClosedIssues(owner: string, repo: string) {
    const today = new Date().toISOString().split('T')[0]; // Ej: "2024-11-07"
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=closed&creator=${GITHUB_USER}&since=${today}T00:00:00Z`;
    const res = await axios.get(url, { headers });
    return res.data;
}

async function getMergedPRs(owner: string, repo: string) {
    const today = new Date().toISOString().split('T')[0]; // Ej: "2024-11-07"
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&since=${today}T00:00:00Z`;
    const res = await axios.get(url, { headers });
    return res.data.filter((pr: any) => pr.merged_at && pr.user.login === GITHUB_USER);
}

// Obtener commits del día de hoy
async function getTodaysCommits(owner: string, repo: string) {
    const today = new Date().toISOString().split('T')[0]; // Ej: "2024-11-07"
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?author=${GITHUB_USER}&since=${today}T00:00:00Z`;

    const res = await axios.get(url, { headers });
    return res.data.map((commit: any) => ({
        sha: commit.sha,
        message: commit.commit.message,
        html_url: `${commit.html_url}`,
    }));
}

// Obtener archivos modificados de un commit
async function getModifiedFiles(owner: string, repo: string, sha: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
    try {
        const res = await axios.get(url, { headers });
        return res.data.files?.map((file: any) => file.filename) || [];
    } catch (error) {
        console.error(`❌ Error obteniendo archivos del commit ${sha}: ${error}`);
        return [];
    }
}


async function generateReport(allData: { repo: string; label: string; issues: any[]; prs: any[]; commits: any[]; }[]) {
    let content = `# Reporte Semanal de Actividades\n\n`;
    content += `Fecha: ${new Date().toLocaleDateString()}\n`;

    for (const data of allData) {
        content += `\n## 🏗️ Repositorio: ${data.label} (${data.repo})\n`;

        content += `\n### 🛠️ Issues Resueltos - ${data.label}\n`;
        if (data.issues.length === 0) {
            content += `\n- Ninguno\n`;
        } else {
            for (const issue of data.issues) {
                content += `\n- [${issue.title}](${issue.html_url})\n`;
            }
        }

        content += `\n### 🔄 Pull Requests Mergiados - ${data.label}\n`;
        if (data.prs.length === 0) {
            content += `\n- Ninguno\n`;
        } else {
            for (const pr of data.prs) {
                content += `\n- [${pr.title}](${pr.html_url})\n`;
            }
        }

        // Commits
        content += `\n### 💾 Commits del día - ${data.label}\n`;
        if (data.commits.length === 0) {
            content += `\n- Ninguno\n`;
        } else {
            for (const commit of data.commits) {
                content += `\n#### Commit: \`${commit.message}\`\n`;
                content += `- [Ver commit](${commit.html_url})\n`;

                const files = await getModifiedFiles(GITHUB_USER!, data.repo, commit.sha);
                if (files.length > 0) {
                    content += `- Archivos modificados:\n`;
                    for (const file of files) {
                        content += `  - ${file}\n`;
                    }
                } else {
                    content += `- No se encontraron archivos modificados.\n`;
                }

                content += '\n---\n';
            }
        }
    }

    const filePath = join(__dirname, '../report.md');
    await fs.writeFile(filePath, content);

    console.log(`✅ Reporte generado en: ${filePath}`);
}

// === EJECUCIÓN ===
(async () => {
    const allData = [];

    for (const repoConfig of config.repos) {
        const { name: repo, label } = repoConfig;

        console.log(`🔄 Obteniendo datos de ${repo}...`);

        try {
            const issues = await getClosedIssues(GITHUB_USER, repo);
            const prs = await getMergedPRs(GITHUB_USER, repo);
            const commits = await getTodaysCommits(GITHUB_USER, repo);

            allData.push({ repo, label, issues, prs, commits });
        } catch (error: any) {
            console.error(`❌ Error obteniendo datos de ${repo}: ${error.message}`);
        }
    }

    await generateReport(allData);
})();