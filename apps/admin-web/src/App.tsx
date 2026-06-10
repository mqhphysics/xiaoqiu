const modules = ['赛事与规则', '球队与名单', '赛程发布', '比赛报告']

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">XIAOQIU ADMIN</p>
          <h1>晓球管理后台</h1>
        </div>
        <span className="status">P0 骨架</span>
      </header>

      <section className="workspace" aria-labelledby="workspace-title">
        <div className="section-heading">
          <div>
            <h2 id="workspace-title">工作区已就绪</h2>
            <p>当前只建立应用边界，业务模块将在后续纵向切片中逐步接入。</p>
          </div>
        </div>

        <div className="module-grid">
          {modules.map((module) => (
            <article className="module-item" key={module}>
              <span className="module-mark" aria-hidden="true" />
              <strong>{module}</strong>
              <span>待实施</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
