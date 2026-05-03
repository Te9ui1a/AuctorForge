#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import sys

def count_chinese_words(text):
    """
    统计中文字数（包含标点符号）
    排除：空格、换行符、英文字母、数字
    包含：中文字符、中文标点
    """
    # 移除空白字符
    text = re.sub(r'\s+', '', text)
    # 移除英文字母和数字
    text = re.sub(r'[a-zA-Z0-9]+', '', text)
    # 移除 markdown 标记符号
    text = re.sub(r'[#*_`\[\]\(\)]+', '', text)
    
    return len(text)

def count_single_chapter(chapter_num, chapter_dir):
    """统计单个章节的字数"""
    # Find file matching pattern
    target_prefix = f"第{chapter_num:03d}章"
    found_file = None
    for filename in os.listdir(chapter_dir):
        if filename.startswith(target_prefix) and filename.endswith(".md"):
            found_file = filename
            break
            
    if not found_file:
        print(f"❌ 错误：未找到第{chapter_num}章文件 (前缀: {target_prefix})")
        return None
        
    file_path = os.path.join(chapter_dir, found_file)
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        words = count_chinese_words(content)
    
    print(f"=== 第{chapter_num}章字数统计 ===")
    print(f"字数: {words} 字")
    print()
    
    if words < 2800:
        shortage = 2800 - words
        print(f"⚠️  字数不足：还需 {shortage} 字才能达到最低标准 (2800字)")
    elif words > 4000:
        excess = words - 4000
        print(f"✅ 字数充足：超出建议上限 {excess} 字 (可接受)")
    else:
        print(f"✅ 字数达标：符合标准范围 (2800-4000字)")
    
    return words

def count_all_chapters(chapter_dir):
    """统计所有章节的字数"""
    if not os.path.isdir(chapter_dir):
        print(f"❌ 错误：章节目录不存在：{chapter_dir}")
        return

    print("=== 章节字数统计报告 (中文字数 + 标点) ===")
    print()
    
    total_words = 0
    chapter_stats = []
    
    for i in range(1, 200):
        chapter_num = f"第{i:03d}章"
        # Find file
        found_file = None
        if os.path.exists(chapter_dir):
            for filename in os.listdir(chapter_dir):
                if filename.startswith(chapter_num) and filename.endswith(".md"):
                    found_file = filename
                    break
        
        if found_file:
            file_path = os.path.join(chapter_dir, found_file)
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                words = count_chinese_words(content)
                total_words += words
                chapter_stats.append((i, words))
                print(f"第{i:3d}章: {words:5d} 字")
        # else:
            # print(f"第{i:3d}章: 文件不存在")
            # chapter_stats.append((i, 0))
    
    print()
    print("=== 统计汇总 ===")
    print(f"总字数: {total_words:,} 字")
    print(f"平均字数: {total_words // 44:,} 字/章")
    
    # 统计字数分布
    ranges = [
        (0, 1500, "< 1500"),
        (1500, 2000, "1500-2000"),
        (2000, 2500, "2000-2500"),
        (2500, 2800, "2500-2800"),
        (2800, 3000, "2800-3000"),
        (3000, float('inf'), "> 3000")
    ]
    
    print()
    print("=== 字数分布 ===")
    for min_w, max_w, label in ranges:
        count = sum(1 for _, w in chapter_stats if min_w <= w < max_w)
        if count > 0:
            print(f"{label:12s} 字: {count:2d} 章 ({count*100//44:2d}%)")
    
    # 找出字数不足的章节
    print()
    print("=== 字数不足章节 (< 2800 字) ===")
    insufficient = [(i, w) for i, w in chapter_stats if 0 < w < 2800]
    
    if insufficient:
        for i, w in insufficient:
            print(f"⚠️  第{i:3d}章: {w:5d} 字 (不足 {2800-w} 字)")
    else:
        print("✅ 所有章节字数均达标")
    
    # 找出最短和最长的章节
    print()
    print("=== 极值统计 ===")
    valid_stats = [(i, w) for i, w in chapter_stats if w > 0]
    if valid_stats:
        min_chapter = min(valid_stats, key=lambda x: x[1])
        max_chapter = max(valid_stats, key=lambda x: x[1])
        print(f"最短章节: 第{min_chapter[0]}章 ({min_chapter[1]} 字)")
        print(f"最长章节: 第{max_chapter[0]}章 ({max_chapter[1]} 字)")

def main():
    chapter_dir = os.environ.get("NOVEL_CHAPTER_DIR", "4-正文")
    
    # 检查命令行参数
    if len(sys.argv) > 1:
        if sys.argv[1] in {"-h", "--help"}:
            print("用法：")
            print("  全部统计: python3 count_chinese_words.py [章节目录]")
            print("  单章统计: python3 count_chinese_words.py 42 [章节目录]")
            print("  环境变量: NOVEL_CHAPTER_DIR=4-正文 python3 count_chinese_words.py")
            return

        try:
            chapter_num = int(sys.argv[1])
            if len(sys.argv) > 2:
                chapter_dir = sys.argv[2]
            count_single_chapter(chapter_num, chapter_dir)
        except ValueError:
            chapter_dir = sys.argv[1]
            count_all_chapters(chapter_dir)
    else:
        # 批量模式
        count_all_chapters(chapter_dir)

if __name__ == "__main__":
    main()
