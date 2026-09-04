import PageHead from "../components/PageHead";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ACCENT_COLORS, FONT_OPTIONS, getTheme, setTheme } from "../utils/theme";
import { track } from "../utils/analytics";

const TEMPLATES = [
  {
    id: 'professional',
    name: '商务双栏',
    description: '双栏布局，侧边栏放置联系方式',
    category: '现代',
    previewImage: '/template-professional.png'
  },
  {
    id: 'classy',
    name: '经典居中',
    description: '传统居中版式，蓝色分区标题',
    category: '经典',
    previewImage: '/template-classy.png'
  },
  {
    id: 'simple',
    name: '极简单栏',
    description: '简约单栏布局，排版清晰易读',
    category: '极简',
    previewImage: '/template-simple.png'
  },
  {
    id: 'stylish',
    name: '优雅深蓝',
    description: '深蓝页眉搭配金色点缀的优雅设计',
    category: '现代',
    previewImage: '/template-stylish.png'
  }
];

export default function Templates() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('professional');
  const [theme, setThemeState] = useState(getTheme());

  const handleUseTemplate = () => {
    if (selected) {
      navigate(`/editor?template=${selected}`);
    }
  };

  const changeAccent = (color) => {
    const next = setTheme({ accent: color.accent });
    setThemeState(next);
    track("theme_change", { kind: "accent", value: color.id });
  };

  const changeFont = (font) => {
    const next = setTheme({ font: font.stack });
    setThemeState(next);
    track("theme_change", { kind: "font", value: font.id });
  };

  return (
    <section>
      <PageHead
        kicker="开始创作"
        title="选择简历模板"
        icon="🎨"
        sub={`从 ${TEMPLATES.length} 套专业模板中挑选，均兼容 ATS 简历筛选系统。`}
      />

      {/* 主题定制：主色调 + 字体（CSS 变量全局生效，编辑器/导出同步） */}
      <div className="dash-card" style={{ marginBottom: '24px' }}>
        <h3>🎨 主题定制</h3>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
          选择主色调与字体，所有模板的预览与导出会同步更新。
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>主色调：</span>
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.id}
              title={color.name}
              onClick={() => changeAccent(color)}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: color.accent,
                border: theme.accent === color.accent ? '3px solid #1d4ed8' : '2px solid #e2e8f0',
                cursor: 'pointer',
                padding: 0,
              }}
              aria-label={color.name}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>字体：</span>
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.id}
              onClick={() => changeFont(font)}
              className={theme.font === font.stack ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '6px 14px', fontFamily: font.stack }}
            >
              {font.name}
            </button>
          ))}
        </div>
      </div>

      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <div
            key={t.id}
            className={`template-card ${selected === t.id ? "active" : ""}`}
            onClick={() => setSelected(t.id)}
          >
            <div className="template-preview">
              <img
                src={t.previewImage}
                alt={t.name}
                style={{
                  width: '100%',
                  height: '200px',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  marginBottom: '12px'
                }}
              />
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>{t.name}</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                {t.description}
              </p>
              <div style={{
                display: 'flex',
                gap: '8px',
                fontSize: '12px',
                flexWrap: 'wrap'
              }}>
                <span style={{
                  padding: '2px 8px',
                  background: '#e3f2fd',
                  color: '#1976d2',
                  borderRadius: '12px'
                }}>
                  {t.category}
                </span>
              </div>
            </div>
            <div className="template-status">
              {selected === t.id ? "✓ 已选中" : "点击选择"}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <button className="btn-primary" onClick={handleUseTemplate}>
            使用此模板
          </button>
        </div>
      )}
    </section>
  );
}
