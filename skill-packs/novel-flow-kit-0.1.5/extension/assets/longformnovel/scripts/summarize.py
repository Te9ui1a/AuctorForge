import os
import re
import time
import json
import threading
import signal
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# 尝试导入 tqdm 用于进度条
try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

# ==========================================
# 👇 配置区域 (自动读取命令行参数和环境变量)
# ==========================================

def _load_dotenv(filepath):
    """从 .env 文件加载 KEY=VALUE 到环境变量（不覆盖已存在的）。"""
    if not os.path.isfile(filepath):
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if k and os.getenv(k) is None:
                        os.environ[k] = v
    except Exception:
        pass


def get_config():
    # 在解析命令行之前，尝试从 .env 加载（项目根目录或脚本所在目录的上一级）
    for dir_path in [os.getcwd(), os.path.dirname(os.path.dirname(os.path.abspath(__file__)))]:
        _load_dotenv(os.path.join(dir_path, ".env"))
        _load_dotenv(os.path.join(dir_path, ".novelkit", ".api.env"))

    # 默认配置
    config = {
        "API_KEY": os.getenv("NOVEL_API_KEY", ""),
        "BASE_URL": os.getenv("NOVEL_API_BASE", "https://api.openai.com/v1"),
        "MODEL_NAME": os.getenv("NOVEL_API_MODEL", "gpt-4o"),
        "OUTPUT_LANGUAGE": "简体中文",
        "START_CHAPTER": 1,
        "TOTAL_CHAPTERS_LIMIT": 0,
        "CHAPTERS_PER_BATCH": 5,
        "MAX_WORKERS": 5,
        "RETRY_TIMES": 3,
    }

    # 命令行参数处理
    if len(sys.argv) > 1:
        config["NOVEL_PATH"] = sys.argv[1]
    else:
        print("❌ 错误：请提供小说文件路径。")
        print("用法: python scripts/summarize.py <小说文件路径>")
        print("API Key 请通过 .env 文件或环境变量 NOVEL_API_KEY 提供，不要写在命令行。")
        sys.exit(1)

    if not config["API_KEY"]:
        env_path = os.path.join(os.getcwd(), ".env")
        if not os.path.isfile(env_path):
            default_env = """# 样板书梗概脚本 API 配置（仅限本地使用，请勿提交到仓库）
NOVEL_API_KEY=
NOVEL_API_BASE=https://api.openai.com/v1
NOVEL_API_MODEL=gpt-4o
"""
            try:
                with open(env_path, "w", encoding="utf-8") as f:
                    f.write(default_env)
                print("已创建 .env 文件：", os.path.abspath(env_path))
            except Exception as e:
                print("❌ 无法创建 .env 文件：", e)
                sys.exit(1)
        print("请在本地打开 .env 文件，填写 NOVEL_API_KEY 后重新运行本脚本。")
        print("（仅限本地使用，请勿将 .env 提交到仓库。）")
        sys.exit(1)

    # 自动推导输出路径
    novel_dir = os.path.dirname(config["NOVEL_PATH"])
    novel_name = os.path.splitext(os.path.basename(config["NOVEL_PATH"]))[0]
    # 输出到上一级目录 (即 1-边界/)
    output_dir = os.path.dirname(novel_dir)
    config["OUTPUT_FILE"] = os.path.join(output_dir, f"1.1_{novel_name}_故事梗概.md")
    
    return config

CONFIG = get_config()

# ==========================================
# 👆 配置结束，以下是核心逻辑
# ==========================================

# 尝试导入 openai，如果没有安装则提示
try:
    from openai import OpenAI
except ImportError:
    print("❌ 错误：未安装 openai 库。")
    print("请在终端运行: pip install openai")
    exit(1)

# 初始化客户端
client = OpenAI(api_key=CONFIG["API_KEY"], base_url=CONFIG["BASE_URL"])

# 缓存目录：与输出文件在同一级目录下
output_dir = os.path.dirname(CONFIG["OUTPUT_FILE"])
CACHE_DIR = os.path.join(output_dir, "summary_cache")

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def extract_chapters(file_path):
    """读取并切分小说章节"""
    if not os.path.exists(file_path):
        print(f"❌ 错误：文件 {file_path} 不存在")
        return []

    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    # -------------------------------------------------------
    # 🎯 智能章节识别逻辑
    # -------------------------------------------------------
    # 兼容格式示例：
    # - 第1章 / 第一卷 / Chapter 1
    # - 1. 标题 / 1 标题 (数字+点/空格)
    # - 序章 / 尾声 / 番外 / 前言 / 后记
    # -------------------------------------------------------
    pattern = re.compile(r'(^\s*(?:第[ \d零一二三四五六七八九十百千万]+[章卷回节]|[\d]+[、\. ]|Chapter\s*[\d]+|序章|尾声|番外|前言|后记).*$)', re.MULTILINE)
    
    matches = list(pattern.finditer(text))
    
    if not matches:
        print("⚠️ 警告：未能识别到任何章节标题！")
        print("可能原因：小说格式特殊，或者正则不匹配。")
        print("建议：检查小说文本，或者在脚本中修改 extract_chapters 的正则 pattern。")
        return []

    chapters = []
    for i, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.start()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        
        # 提取内容（去除标题本身）
        content = text[start:end].replace(title, "", 1).strip()
        
        chapters.append({"index": i+1, "title": title, "content": content})
        
    print(f"✅ 成功识别 {len(chapters)} 个章节")
    
    # 打印前几个章节供检查
    print("👀 识别示例 (前5章):")
    for c in chapters[:5]:
        print(f"   - [{c['index']}] {c['title']}")
    print("   ...")
    
    return chapters

def is_traditional_chinese(text):
    """简单的繁体字检测 (启发式)"""
    # 常用繁体字样本
    traditional_chars = set("為麼這門見過對來應說後個國時種開車貝長樂風龍")
    count = sum(1 for char in text if char in traditional_chars)
    # 如果繁体字占比超过 1% (且总字数>100)，则认为是繁体
    return count > 0 and (count / len(text) > 0.005)

def review_and_fix_batches(batches, results, output_lang):
    """审查并修复有问题的批次"""
    bad_batches = []
    
    print("\n🔍 开始质量审查 (Review)...")
    
    for batch in batches:
        batch_id = batch["id"]
        if batch_id not in results:
            continue # 已经失败的不用管，主循环会处理
            
        content = results[batch_id]
        expected_count = len(batch["chapters"])
        
        # 1. 检查章节数量 (简单数 "##" 标题数量)
        # 宽松匹配，允许误差
        chapter_headers = content.count("## ")
        if chapter_headers < expected_count:
            print(f"❌ 批次 {batch_id} 完整性存疑: 预期 {expected_count} 章，实际识别到 {chapter_headers} 章。")
            bad_batches.append(batch)
            continue
            
        # 2. 检查语言 (仅当目标是简体中文时)
        if output_lang == "简体中文" and is_traditional_chinese(content):
             print(f"❌ 批次 {batch_id} 语言检测异常: 发现大量繁体字。")
             bad_batches.append(batch)
             continue
             
    return bad_batches

def generate_summary(batch_chapters, batch_id, is_retry=False):
    """调用 API 生成总结"""
    
    # 构建 Prompt
    titles = [c['title'] for c in batch_chapters]
    content_text = "\n\n".join([c['content'] for c in batch_chapters])
    
    # 如果是重试 (Review 不通过)，加强语气
    system_instruction = f"你是一个高效的小说摘要助手。请直接输出 Markdown 格式的章节梗概。注意：输出语言必须是 {CONFIG['OUTPUT_LANGUAGE']}。"
    if is_retry:
        system_instruction += " ⚠️ 上次生成的内容因语言或完整性问题未通过审查，请务必严格按照要求输出，特别是【繁简转换】和【章节完整性】。"
    
    prompt = f"""
你是一个专业的小说剧情分析师。请阅读以下 {len(batch_chapters)} 个章节的小说内容，并输出每个章节的【故事梗概】。

章节列表：
{', '.join(titles)}

【要求】
1. **请务必使用【{CONFIG['OUTPUT_LANGUAGE']}】来撰写所有的梗概内容**（即使原文是其他语言）。
2. 每个章节独立输出一段梗概，字数约50-100字。
3. 重点概括：核心事件、关键人物行动、剧情转折、伏笔。
4. 格式必须严格遵守以下 Markdown 格式，不要添加其他开场白：

## [完整章节标题]
[这里是梗概内容...]

---

以下是小说正文内容：
{content_text}
"""

    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt}
    ]

    # API 调用
    for attempt in range(CONFIG["RETRY_TIMES"]):
        try:
            response = client.chat.completions.create(
                model=CONFIG["MODEL_NAME"],
                messages=messages,
                temperature=0.7,
                max_tokens=4000  # 增加到 4000 以适应 20 章的输出量
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"⚠️ 批次 {batch_id} (尝试 {attempt+1}/{CONFIG['RETRY_TIMES']}) 失败: {str(e)}")
            time.sleep(2 * (attempt + 1))
    
    return None


def generate_single_chapter_summary(chapter_dict, batch_id_suffix=""):
    """单章调用 API 生成梗概（用于单章审查修复）"""
    title = chapter_dict["title"]
    content = chapter_dict["content"]
    system_instruction = f"你是一个高效的小说摘要助手。请直接输出 Markdown 格式的一章梗概。输出语言必须是 {CONFIG['OUTPUT_LANGUAGE']}。"
    prompt = f"""
请阅读以下章节内容，输出该章节的【故事梗概】。

章节标题：{title}

【要求】
1. 使用【{CONFIG['OUTPUT_LANGUAGE']}】撰写，字数约 50-100 字。
2. 重点概括：核心事件、关键人物行动、剧情转折。
3. 格式严格按以下两行，不要其他开场白：

## {title}
[梗概内容...]
"""
    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt + "\n\n以下是正文：\n" + content}
    ]
    for attempt in range(CONFIG["RETRY_TIMES"]):
        try:
            response = client.chat.completions.create(
                model=CONFIG["MODEL_NAME"],
                messages=messages,
                temperature=0.5,
                max_tokens=500,
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"⚠️ 单章重试 ({title[:20]}... 尝试 {attempt+1}/{CONFIG['RETRY_TIMES']}) 失败: {e}")
            time.sleep(2 * (attempt + 1))
    return None


def _parse_batch_content_to_sections(content):
    """将批次输出按 ## 标题拆成 [(title, section_text), ...]"""
    sections = []
    pattern = re.compile(r'^##\s+(.+)$', re.MULTILINE)
    matches = list(pattern.finditer(content))
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        section_text = content[m.end():end].strip()
        sections.append((title, section_text))
    return sections


def review_and_fix_single_chapters(batches, results, output_lang, min_section_len=15):
    """单章审查：检查每批内各章梗概长度，过短的单独重生成并替换"""
    fixed_any = False
    for batch in batches:
        batch_id = batch["id"]
        if batch_id not in results:
            continue
        content = results[batch_id]
        sections = _parse_batch_content_to_sections(content)
        expected = len(batch["chapters"])
        if len(sections) < expected:
            continue
        new_parts = []
        batch_fixed = False
        for i, (sec_title, sec_text) in enumerate(sections):
            if i >= expected:
                new_parts.append(f"## {sec_title}\n{sec_text}")
                continue
            is_bad = (not sec_text or len(sec_text.strip()) < min_section_len)
            if output_lang == "简体中文" and sec_text and is_traditional_chinese(sec_text):
                is_bad = True
            if not is_bad:
                new_parts.append(f"## {sec_title}\n{sec_text}")
                continue
            ch = batch["chapters"][i]
            print(f"   🔧 单章修复: {ch['title'][:30]}... (内容过短或语言异常)")
            single = generate_single_chapter_summary(ch, batch_id)
            if single:
                new_parts.append(single.strip())
                batch_fixed = True
                fixed_any = True
            else:
                new_parts.append(f"## {sec_title}\n{sec_text}")
        if batch_fixed:
            new_content = "\n\n".join(new_parts)
            results[batch_id] = new_content
            cache_path = os.path.join(CACHE_DIR, batch_id + ".md")
            with open(cache_path, "w", encoding="utf-8") as f:
                f.write(new_content)
    return fixed_any


def main():
    print("🚀 开始执行全自动并行总结脚本...")
    print(f"📖 目标小说: {os.path.basename(CONFIG['NOVEL_PATH'])}")
    print(f"🧵 并行数量: {CONFIG['MAX_WORKERS']}")
    
    # 1. 读取章节
    all_chapters = extract_chapters(CONFIG["NOVEL_PATH"])
    if not all_chapters: return

    # 2. 过滤需要处理的章节
    start_idx = CONFIG["START_CHAPTER"] - 1
    if start_idx < 0: start_idx = 0
    target_chapters = all_chapters[start_idx:]
    
    # 限制总章节数
    limit = CONFIG["TOTAL_CHAPTERS_LIMIT"]
    if limit > 0:
        target_chapters = target_chapters[:limit]
    
    if not target_chapters:
        print("⚠️ 没有需要处理的章节。")
        return

    print(f"📌 计划处理: 第 {target_chapters[0]['index']} 章 - 第 {target_chapters[-1]['index']} 章 (共 {len(target_chapters)} 章)")

    # 3. 批次分组
    batch_size = CONFIG["CHAPTERS_PER_BATCH"]
    batches = []
    for i in range(0, len(target_chapters), batch_size):
        batch = target_chapters[i : i + batch_size]
        batch_id = f"batch_{batch[0]['index']:04d}_{batch[-1]['index']:04d}"
        batches.append({"id": batch_id, "chapters": batch})

    print(f"📦 拆分为 {len(batches)} 个任务批次，准备并发处理...")

    # 4. 并发执行
    results = {}
    lock = threading.Lock()
    stop_event = threading.Event()

    # 优雅中断处理
    def signal_handler(sig, frame):
        print("\n\n⚠️ 检测到中断信号 (Ctrl+C)！")
        print("🛑 正在强制停止所有任务...")
        stop_event.set()
        # 强制退出，不再等待子线程
        os._exit(0)
        
    signal.signal(signal.SIGINT, signal_handler)
    
    # 先加载已有的缓存
    for batch in batches:
        cache_path = os.path.join(CACHE_DIR, batch["id"] + ".md")
        if os.path.exists(cache_path):
            with open(cache_path, 'r', encoding='utf-8') as f:
                results[batch["id"]] = f.read()
    
    pending_batches = [b for b in batches if b["id"] not in results]
    print(f"🔄 已跳过 {len(batches) - len(pending_batches)} 个已完成批次，剩余 {len(pending_batches)} 个待处理...")

    if not pending_batches:
        print("✅ 所有批次均已完成 (缓存命中)。")
    else:
        # 使用 tqdm 进度条 (如果有)
        pbar = tqdm(total=len(pending_batches), desc="AI 总结进度", unit="批") if tqdm else None
        
        with ThreadPoolExecutor(max_workers=CONFIG["MAX_WORKERS"]) as executor:
            futures = {}
            
            # 提交所有任务
            for batch in pending_batches:
                if stop_event.is_set(): break
                f = executor.submit(generate_summary, batch["chapters"], batch["id"])
                futures[f] = batch

            # 处理结果
            for future in as_completed(futures):
                batch = futures[future]
                try:
                    summary = future.result()
                    if summary:
                        # 写入缓存
                        cache_path = os.path.join(CACHE_DIR, batch["id"] + ".md")
                        with open(cache_path, 'w', encoding='utf-8') as f:
                            f.write(summary)
                        
                        with lock:
                            results[batch["id"]] = summary
                            
                        if pbar: pbar.update(1)
                        else: print(f"✅ 完成批次 {batch['id']}")
                    else:
                        print(f"\n❌ 批次 {batch['id']} 失败")
                except Exception as exc:
                    print(f"\n❌ 批次 {batch['id']} 异常: {exc}")
                
                if stop_event.is_set():
                    break
                    
        if pbar: pbar.close()

    if stop_event.is_set():
        print("\n⚠️ 脚本已因用户中断而停止。")
        print(f"💾 已保存当前进度。下次运行脚本时，会自动从断点处继续。")
        sys.exit(0)

    # 5. 质量审查 (Review) & 自动修复：分批审查两轮 + 单章审查一轮
    def do_batch_review_and_fix(bad_list):
        for i, batch in enumerate(bad_list):
            print(f"   > 正在重修批次 {batch['id']} ({i+1}/{len(bad_list)})...")
            summary = generate_summary(batch["chapters"], batch["id"], is_retry=True)
            if summary:
                cache_path = os.path.join(CACHE_DIR, batch["id"] + ".md")
                with open(cache_path, 'w', encoding='utf-8') as f:
                    f.write(summary)
                results[batch["id"]] = summary

    # 5.1 分批审查第 1 轮
    bad_batches = review_and_fix_batches(batches, results, CONFIG["OUTPUT_LANGUAGE"])
    if bad_batches:
        print(f"🛠️ [分批审查 1/2] 发现 {len(bad_batches)} 个问题批次，正在修复...")
        do_batch_review_and_fix(bad_batches)

    # 5.2 分批审查第 2 轮
    bad_batches2 = review_and_fix_batches(batches, results, CONFIG["OUTPUT_LANGUAGE"])
    if bad_batches2:
        print(f"🛠️ [分批审查 2/2] 发现 {len(bad_batches2)} 个问题批次，正在修复...")
        do_batch_review_and_fix(bad_batches2)

    # 5.3 单章审查一轮
    print("\n🔍 开始单章审查...")
    if review_and_fix_single_chapters(batches, results, CONFIG["OUTPUT_LANGUAGE"]):
        print("   ✅ 部分章节已单章修复。")

    # 6. 合并结果
    print("\n💾 正在合并所有梗概...")
    final_content = f"# 《{os.path.basename(CONFIG['NOVEL_PATH'])}》 全书故事梗概\n\n> 本文档由 AI 自动并行生成\n\n"
    
    # 按顺序合并
    for batch in batches:
        if batch["id"] in results:
            final_content += results[batch["id"]] + "\n\n"
    
    with open(CONFIG["OUTPUT_FILE"], 'w', encoding='utf-8') as f:
        f.write(final_content)
        
    print(f"🎉 全部完成！结果已保存至:\n{CONFIG['OUTPUT_FILE']}")


if __name__ == "__main__":
    main()
