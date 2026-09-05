import EditableField from '../editor/EditableField';
import ResumePhotoSlot from './ResumePhotoSlot';
import { injectCustomBlocks } from './CustomModules';

/**
 * 经典居中版 —— 蓝色分区标题
 *
 * 支持 settings.moduleVisible(隐藏)与 settings.moduleOrder(排序,单栏模板)。
 * onUpdate* 任一提供时启用可编辑,否则 fallback 占位符(向后兼容)。
 */
const DEFAULT_ORDER = ["summary", "experience", "education", "skills"];

const ClassyPreview = ({
    resume,
    settings,
    onUpdateField,
    onUpdateExperience,
    onUpdateBullet,
    onUpdateEducation,
    onUpdateCustom,
}) => {
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

    // 可见性 + 顺序
    const visible = settings?.moduleVisible || {};
    const order = (settings?.moduleOrder || DEFAULT_ORDER).filter((id) => visible[id] !== false);

    /* 各模块渲染 */
    const blocks = {
        summary: (resume.summary || onUpdateField) && (
            <div key="summary">
                <h4>个人简介</h4>
                <p className="editable-block">{F("summary", "一句话介绍自己...", true)}</p>
            </div>
        ),
        experience: resume.experiences && resume.experiences.some(exp => exp.company || exp.role) && (
            <div key="experience">
                <h4>工作经历</h4>
                {resume.experiences.map((exp, i) => (
                    (exp.company || exp.role || onUpdateExperience) && (
                        <div key={i} style={{ marginBottom: '20px' }}>
                            <div>
                                <span className="job-title">{Tx(i, "role", "职位")}</span>
                                <span className="date" style={{ float: 'right' }}>{Tx(i, "duration", "时间")}</span>
                            </div>
                            <div className="company">{Tx(i, "company", "公司名称")}</div>
                            <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
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
            </div>
        ),
        education: resume.education && resume.education.some(edu => edu.school || edu.degree) && (
            <div key="education">
                <h4>教育背景</h4>
                {resume.education.map((edu, i) => (
                    (edu.school || edu.degree || onUpdateEducation) && (
                        <div key={i} style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{Ed(i, "school", "学校")}</div>
                                <div>{Ed(i, "degree", "学历")} {Ed(i, "field", "专业")}</div>
                            </div>
                            <div>{Ed(i, "graduationYear", "毕业年份")}</div>
                        </div>
                    )
                ))}
            </div>
        ),
        skills: (resume.skills || onUpdateField) && (
            <div key="skills">
                <h4>技能</h4>
                <p className="editable-block">{F("skills", "技能用逗号分隔", true)}</p>
            </div>
        ),
    };
    injectCustomBlocks(blocks, resume.customSections, onUpdateCustom);

    return (
        <div className="resume-card-classy">
            <ResumePhotoSlot
                photo={resume.photo}
                onUpdate={onUpdateField && ((v) => onUpdateField('photo', v))}
            />
            <h1 className="editable-block">{F("name", "你的姓名")}</h1>
            <div className="contact-line">
                <EditableSpan onUpdate={onUpdateField} field="phone" value={resume.phone} placeholder="138-0000-0000" /> | {" "}
                <EditableSpan onUpdate={onUpdateField} field="email" value={resume.email} placeholder="you@example.com" /> | {" "}
                <EditableSpan onUpdate={onUpdateField} field="location" value={resume.location} placeholder="所在城市" />
                {(resume.linkedin || onUpdateField) && (
                    <> | <EditableSpan onUpdate={onUpdateField} field="linkedin" value={resume.linkedin} placeholder="linkedin.com/in/你的主页" /></>
                )}
            </div>

            {order.map((id) => blocks[id]).filter(Boolean)}
        </div>
    );
};

// 内联简写:有回调时 EditableField,否则纯文本
function EditableSpan({ onUpdate, field, value, placeholder }) {
    if (!onUpdate) return <>{value || placeholder}</>;
    return (
        <EditableField
            value={value ?? ''}
            onChange={(v) => onUpdate(field, v)}
            placeholder={placeholder}
            style={{ display: 'inline' }}
        />
    );
}

export default ClassyPreview;