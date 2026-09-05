import EditableField from '../editor/EditableField';
import ResumePhotoSlot from './ResumePhotoSlot';
import { injectCustomBlocks } from './CustomModules';
import { TEMPLATE_ZONES, zoneSeq } from '../../utils/resumeSettings';

/**
 * 优雅深蓝 —— 深蓝页眉 + 金色点缀
 *
 * 栏分区(数据驱动顺序):
 *   left  = [education, skills](左栏内可拖拽排序)
 *   right = [summary, experience](右栏内可拖拽排序)
 * 顺序来自 settings.moduleOrder(全局),各栏按其中相对顺序过滤渲染。
 * onUpdate* 任一提供时启用可编辑,否则 fallback 占位符(向后兼容)。
 */
const StylishPreview = ({
    resume,
    settings,
    zones,
    onUpdateField,
    onUpdateExperience,
    onUpdateBullet,
    onUpdateEducation,
    onUpdateCustom,
}) => {
    const vis = (id) => settings?.moduleVisible?.[id] !== false;
    const order = settings?.moduleOrder || null;
    const zz = zones || TEMPLATE_ZONES.stylish;
    const leftZone = zz[0];
    const rightZone = zz[zz.length - 1]; // 右栏(含注入的自定义模块)
    const leftOrder = order ? zoneSeq(order, leftZone).filter((id) => vis(id)) : leftZone.modules.filter((id) => vis(id));
    const rightOrder = order ? zoneSeq(order, rightZone).filter((id) => vis(id)) : rightZone.modules.filter((id) => vis(id));

    const F = (field, placeholder, multiline = false) => onUpdateField
        ? <EditableField value={resume[field] ?? ''} onChange={(v) => onUpdateField(field, v)} placeholder={placeholder} multiline={multiline}
            ai={(field === 'summary' || field === 'skills') ? { k: 'field', f: field } : null} />
        : (resume[field] || placeholder);

    const Tx = (ei, field, placeholder) => onUpdateExperience
        ? <EditableField value={resume.experiences[ei][field] ?? ''} onChange={(v) => onUpdateExperience(ei, field, v)} placeholder={placeholder} ai={{ k: 'exp', i: ei }} />
        : (resume.experiences[ei][field] || placeholder);

    const Tb = (ei, bi, value) => onUpdateBullet
        ? <EditableField value={value} onChange={(v) => onUpdateBullet(ei, bi, v)} placeholder="• 输入要点" ai={{ k: 'bullet', i: ei, bi }} />
        : value;

    const Ed = (i, field, placeholder) => onUpdateEducation
        ? <EditableField value={resume.education[i][field] ?? ''} onChange={(v) => onUpdateEducation(i, field, v)} placeholder={placeholder} />
        : (resume.education[i][field] || placeholder);

    /* 左栏内容块(联系方式固定顶部) */
    const leftBlocks = {
        education: (resume.education && resume.education.some(edu => edu.school || edu.degree)) && (
            <section key="education">
                <h4>教育背景</h4>
                {resume.education.map((edu, i) => (
                    (edu.school || edu.degree || onUpdateEducation) && (
                        <div key={i} style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#2C3E50' }}>{Ed(i, "degree", "学历")} / {Ed(i, "field", "专业")}</div>
                            <div style={{ fontSize: '11px', color: '#666' }}>{Ed(i, "school", "学校")}</div>
                            <div style={{ fontSize: '11px', color: '#666' }}>{Ed(i, "graduationYear", "毕业年份")}</div>
                        </div>
                    )
                ))}
            </section>
        ),
        skills: (resume.skills || onUpdateField) && (
            <section key="skills">
                <h4>技能</h4>
                <ul style={{ paddingLeft: '16px' }}>
                    {(resume.skills || "").split(',').map((skill, i) => (
                        skill.trim() && <li key={i} style={{ fontSize: '11px', marginBottom: '4px' }}>{skill.trim()}</li>
                    ))}
                </ul>
            </section>
        ),
    };

    /* 右栏内容块 */
    const rightBlocks = {
        summary: (resume.summary || onUpdateField) && (
            <section key="summary">
                <h4>个人简介</h4>
                <p className="editable-block" style={{ fontSize: '12px', lineHeight: '1.6', color: '#444' }}>
                    {F("summary", "一句话介绍自己...", true)}
                </p>
            </section>
        ),
        experience: (resume.experiences && resume.experiences.some(exp => exp.company || exp.role)) && (
            <section key="experience">
                <h4>工作经历</h4>
                {resume.experiences.map((exp, i) => (
                    (exp.company || exp.role || onUpdateExperience) && (
                        <div key={i} style={{ marginBottom: '20px' }}>
                            <div className="job-title">{Tx(i, "role", "职位")}</div>
                            <div className="company">{Tx(i, "company", "公司名称")} | {Tx(i, "duration", "时间")}</div>
                            <ul>
                                {exp.bullets.map((bullet, bi) => {
                                    const empty = !bullet.trim();
                                    if (empty && !onUpdateBullet) return null;
                                    return (
                                        <li key={bi}>{Tb(i, bi, bullet)}</li>
                                    );
                                })}
                            </ul>
                        </div>
                    )
                ))}
            </section>
        ),
    };
    injectCustomBlocks(rightBlocks, resume.customSections, onUpdateCustom);

    return (
        <div className="resume-card-stylish">
            <div className="header-bar">
                <ResumePhotoSlot
                    photo={resume.photo}
                    onUpdate={onUpdateField && ((v) => onUpdateField('photo', v))}
                    size="header"
                />
                <h1 className="editable-block">{F("name", "你的姓名")}</h1>
                <h3 className="editable-block">{F("title", "你的目标职位")}</h3>
            </div>

            <div className="content-area">
                <div className="left-column">
                    <h4>联系方式</h4>
                    <div className="contact-item">📞 {F("phone", "138-0000-0000")}</div>
                    <div className="contact-item">✉️ {F("email", "you@example.com")}</div>
                    <div className="contact-item">📍 {F("location", "所在城市")}</div>
                    {(resume.linkedin || onUpdateField) && <div className="contact-item">💼 {F("linkedin", "linkedin 链接")}</div>}

                    {leftOrder.map((id) => leftBlocks[id]).filter(Boolean)}
                </div>

                <div className="right-column">
                    {rightOrder.map((id) => rightBlocks[id]).filter(Boolean)}
                </div>
            </div>
        </div>
    );
};

export default StylishPreview;
