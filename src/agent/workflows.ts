import fs from 'fs';
import path from 'path';
import { processUserMessage } from './loop.js';

export interface Workflow {
    description: string;
    triggers: string[];
    summary: string;
    steps: string[];
}

export function loadWorkflows(): Workflow[] {
    const workflowsDir = path.resolve(process.cwd(), 'workflows');
    if (!fs.existsSync(workflowsDir)) return [];

    const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.md'));
    const workflows: Workflow[] = [];

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
            
            // Un parser muy básico de Markdown / YAML Frontmatter
            const workflow: Partial<Workflow> = { steps: [] };
            
            // Extraer frontmatter (si existe)
            const fmMatch = content.match(/---\s*([\s\S]*?)\s*---/);
            if (fmMatch) {
                const fm = fmMatch[1];
                workflow.description = fm.match(/description:\s*(.*)/)?.[1];
                const triggersLine = fm.match(/triggers:\s*\n?\s*-\s*"(.*)"/);
                if (triggersLine) {
                    workflow.triggers = [triggersLine[1]];
                }
            }

            // Extraer pasos (líneas que empiezan con número)
            const steps = content.match(/^\d+\.\s*(.*)/gm);
            if (steps) {
                workflow.steps = steps.map(s => s.replace(/^\d+\.\s*/, '').trim());
            }

            if (workflow.triggers) {
                workflow.summary = content.split('\r\n').join('\n').split('\n\n')[1] || workflow.description || '';
                workflows.push(workflow as Workflow);
            }
        } catch (e) {
            console.error(`Error procesando workflow ${file}:`, e);
        }
    }
    return workflows;
}

export async function executeWorkflowIfMatches(userId: number, command: string): Promise<string | null> {
    const workflows = loadWorkflows();
    const workflow = workflows.find(wf => wf.triggers.includes(command));
    
    if (!workflow) return null;

    // Construimos una instrucción compuesta para el agente basada en los pasos del workflow
    const instruction = `[INSTRUCCIÓN DE FLUJO DE TRABAJO AUTOMÁTICO]\n` +
        `El usuario ha activado el flujo: "${workflow.description}"\n` +
        `Debes realizar los siguientes pasos de forma autónoma:\n` +
        workflow.steps.map((s, i) => `${i+1}. ${s}`).join('\n') +
        `\\n\\nInicia el flujo AHORA con un saludo propio de tu nombre de bot.`;

    return await processUserMessage(userId, instruction);
}
