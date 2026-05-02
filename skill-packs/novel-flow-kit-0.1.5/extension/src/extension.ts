import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// 源文件夹名称 (假设插件打包时会包含 assets 文件夹)
const SOURCE_SKILL_DIR_NAME = 'longformnovel';
const SOURCE_README_NAME = '长篇小说技能说明书.md';

export function activate(context: vscode.ExtensionContext) {
    console.log('NovelFlow Novel Kit extension is now active!');

    // 1. 注册初始化命令
    let disposable = vscode.commands.registerCommand('project.initNovelKit', async () => {
        await initNovelKit(context);
    });
    context.subscriptions.push(disposable);

    // 2. 检查是否需要自动提示初始化
    checkAndPromptInit(context);

    // 3. 监听工作区文件夹变化 (用户打开新文件夹时)
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        checkAndPromptInit(context);
    });
}

async function checkAndPromptInit(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return; // 没有打开项目
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const targetSkillPath = path.join(rootPath, '.novelflow', 'skills', SOURCE_SKILL_DIR_NAME);

    // 如果目标文件夹不存在，提示用户初始化
    if (!fs.existsSync(targetSkillPath)) {
        const answer = await vscode.window.showInformationMessage(
            '检测到当前项目尚未初始化 NovelFlow 长篇小说技能包。是否立即初始化？',
            '立即初始化',
            '稍后'
        );

        if (answer === '立即初始化') {
            await initNovelKit(context);
        }
    }
}

async function initNovelKit(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('请先打开一个文件夹作为项目根目录。');
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    
    // 获取插件内部的 assets 路径 (我们需要在打包时把 skills 文件夹放进去)
    // 假设结构: extension/assets/longformnovel
    const extensionPath = context.extensionPath;
    const sourcePath = path.join(extensionPath, 'assets', SOURCE_SKILL_DIR_NAME);
    
    // 目标路径 1: .novelflow/skills/longformnovel
    const targetDir = path.join(rootPath, '.novelflow', 'skills', SOURCE_SKILL_DIR_NAME);
    
    // 目标路径 2: 项目根目录/长篇小说技能说明书.md
    const sourceReadmePath = path.join(sourcePath, SOURCE_README_NAME);
    const targetReadmePath = path.join(rootPath, SOURCE_README_NAME);

    // 目标路径 3: 项目根目录/PROJECT.md（从技能包 docs 复制）
    const sourceProjectPath = path.join(sourcePath, 'docs', 'PROJECT.md');
    const targetProjectPath = path.join(rootPath, 'PROJECT.md');

    // 目标路径 4: memory 模板
    const sourceCharStatePath = path.join(sourcePath, 'docs', 'TEMPLATE_CHARACTER_STATE.md');
    const targetCharStatePath = path.join(rootPath, '.novelkit', 'memory', 'character_state.md');
    
    const sourceForeshadowingPath = path.join(sourcePath, 'docs', 'TEMPLATE_FORESHADOWING.md');
    const targetForeshadowingPath = path.join(rootPath, '.novelkit', 'memory', 'foreshadowing.md');

    // 目标路径 5: 创作宪法 (MASTER.md -> .novelkit/constitution/MASTER.md)
    const sourceMasterPath = path.join(sourcePath, 'docs', 'MASTER.md');
    const targetMasterPath = path.join(rootPath, '.novelkit', 'constitution', 'MASTER.md');

    // 目标路径 6: 新书预期 (expectation_template.md -> 1-边界/预期.md)
    const sourceExpectationPath = path.join(sourcePath, 'docs', 'expectation_template.md');
    const targetExpectationPath = path.join(rootPath, '1-边界', '预期.md');

    // 检查源文件是否存在
    if (!fs.existsSync(sourcePath)) {
        vscode.window.showErrorMessage(`插件损坏：找不到源文件目录 ${sourcePath}`);
        return;
    }

    try {
        // 1. 创建标准目录结构（与 SKILL.md 一致）
        const dirs = [
            path.join(rootPath, '.novelkit', 'constitution'),
            path.join(rootPath, '.novelkit', 'memory'),
            path.join(rootPath, '1-边界'),
            path.join(rootPath, '2-设定'),
            path.join(rootPath, '3-大纲'),
            path.join(rootPath, '4-正文'),
            path.join(rootPath, '5-审查'),
        ];
        for (const dir of dirs) {
            await fs.promises.mkdir(dir, { recursive: true });
        }

        // 2. 复制 PROJECT.md 到项目根目录（若根目录尚无该文件）
        if (fs.existsSync(sourceProjectPath) && !fs.existsSync(targetProjectPath)) {
            fs.copyFileSync(sourceProjectPath, targetProjectPath);
        }

        // 3. 复制 memory 模板到 .novelkit/memory/（若不存在）
        if (fs.existsSync(sourceCharStatePath) && !fs.existsSync(targetCharStatePath)) {
            fs.copyFileSync(sourceCharStatePath, targetCharStatePath);
        }
        if (fs.existsSync(sourceForeshadowingPath) && !fs.existsSync(targetForeshadowingPath)) {
            fs.copyFileSync(sourceForeshadowingPath, targetForeshadowingPath);
        }

        // 3b. 复制创作宪法模板到 .novelkit/constitution/（若不存在）
        if (fs.existsSync(sourceMasterPath) && !fs.existsSync(targetMasterPath)) {
            fs.copyFileSync(sourceMasterPath, targetMasterPath);
        }

        // 3c. 复制新书预期模板到 1-边界/预期.md（若不存在）
        if (fs.existsSync(sourceExpectationPath) && !fs.existsSync(targetExpectationPath)) {
            fs.copyFileSync(sourceExpectationPath, targetExpectationPath);
        }

        // 4. 复制技能包文件夹
        await copyDirectory(sourcePath, targetDir);

        // 5. 复制说明书 (如果源目录里有说明书的话)
        if (fs.existsSync(sourceReadmePath)) {
             fs.copyFileSync(sourceReadmePath, targetReadmePath);
        }

        vscode.window.showInformationMessage('NovelFlow 长篇小说技能包初始化成功！');
        
        // 可选：打开说明书
        if (fs.existsSync(targetReadmePath)) {
            const doc = await vscode.workspace.openTextDocument(targetReadmePath);
            await vscode.window.showTextDocument(doc);
        }

    } catch (error: any) {
        vscode.window.showErrorMessage(`初始化失败: ${error.message}`);
    }
}

async function copyDirectory(src: string, dest: string) {
    await fs.promises.mkdir(dest, { recursive: true });
    
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.promises.copyFile(srcPath, destPath);
        }
    }
}

export function deactivate() {}
