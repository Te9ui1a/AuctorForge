export function StartupProductPreview() {
  return (
    <section
      className="startup-product-preview"
      aria-label="创作现场预览"
      data-entry-surface="product-preview"
      data-entry-preview="writing-desk"
    >
      <div className="startup-product-preview-header">
        <span className="startup-product-preview-badge">正在写</span>
        <span>长篇小说项目</span>
      </div>
      <div className="startup-product-preview-paper" aria-hidden="true">
        <div className="startup-product-preview-kicker">当前文稿</div>
        <strong>第 001 章</strong>
        <p>下一段，从这里继续。</p>
      </div>
      <div className="startup-product-preview-footer" aria-hidden="true">
        <span>创作助手</span>
        <span>准备好了。</span>
      </div>
    </section>
  );
}
