import EditableField from '../editor/EditableField';
import ResumePhotoSlot from './ResumePhotoSlot';

/**
 * 极简单栏 —— 标题大字 + 联系方式 + 技能/经历
 *
 * 支持 settings.moduleVisible(隐藏)与 settings.moduleOrder(排序,单栏模板)。
 * onUpdate* 任一提供时启用可编辑,否则 fallback 占位符(向后兼容)。
 */
const DEFAULT_ORDER = ["summary", "experience", "education", "skills"];

const SimplePreview = ({
    resume,
    settings,
    onUpdateField,
    onUpdateExperience,
    onUpdateBullet,
    onUpdateEducation,
}) => {
    const F = (field, placeholder, multiline = false) => onUpdateField
        ? <EditableField value={resume[field] ?? ''} onChange={(v) => onUpdateField(field, v)} placeholder={placeholder} multiline={multiline} />
        : (resume[field] || placeholder);

    const Tx = (ei, field, placeholder) => onUpdateExperience
        ? <EditableField value={resume.experiences[ei][field] ?? ''} onChange={(v) => onUpdateExperience(ei, field, v)} placeholder={placeholder} />
        : (resume.experiences[ei][field] || placeholder);

    const Tb = (ei, bi, value) => onUpdateBullet
        ? <EditableField value={value} onChange={(v) => onUpdateBullet(ei, bi, v)} placeholder="• 输入要点" />
        : value;

    const Ed = (i, field, placeholder) => onUpdateEducation
        ? <EditableField value={resume.education[i][field] ?? ''} onChange={(v) => onUpdateEducation(i, field, v)} placeholder={placeholder} />
        : (resume.education[i][field] || placeholder);

    const visible = settings?.moduleVisible || {};
    const order = (settings?.moduleOrder || DEFAULT_ORDER).filter((id) => visible[id] !== false);

    const blocks = {
        summary: (resume.summary || onUpdateField) && (
            <div key="summary" className="headline editable-block">{F("summary", "一句话介绍自己...", true)}</div>
        ),
        skills: (resume.skills || onUpdateField) && (
            <div key="skills">
                <h4>核心技能</h4>
                <p className="editable-block" style={{ fontSize: '12px' }}>{F("skills", "技能用逗号分隔", true)}</p>
            </div>
        ),
        experience: resume.experiences && resume.experiences.some(exp => exp.company || exp.role) && (
            <div key="experience">
                <h4>工作经历</h4>
                {resume.experiences.map((exp, i) => (
                    (exp.company || exp.role || onUpdateExperience) && (
                        <div key={i} style={{ marginBottom: '20px' }}>
                            <div className="job-header">
                                <div>
                                    <div className="company">{Tx(i, "company", "公司")}</div>
                                    <div className="job-title">{Tx(i, "role", "职位")}</div>
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>{Tx(i, "duration", "YYYY/MM - 至今")}</div>
                            </div>
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
            </div>
        ),
        education: resume.education && resume.education.some(edu => edu.school || edu.degree) && (
            <div key="education">
                <h4>教育背景</h4>
                {resume.education.map((edu, i) => (
                    (edu.school || edu.degree || onUpdateEducation) && (
                        <div key={i} style={{ fontSize: '12px', marginBottom: '8px' }}>
                            {Ed(i, "degree", "学历")}, {Ed(i, "graduationYear", "毕业年份")}, {Ed(i, "school", "学校")}
                        </div>
                    )
                ))}
            </div>
        ),
    };

    return (
        <div className="resume-card-simple">
            <div className="header">
                <div className="header-left">
                    <ResumePhotoSlot
                        photo={resume.photo}
                        onUpdate={onUpdateField && ((v) => onUpdateField('photo', v))}
                        size="small"
                    />
                    <h1 className="editable-block">{F("name", "你的姓名")}</h1>
                </div>
                <div className="contact">
                    {F("location", "所在城市")}<br />
                    {F("email", "you@example.com")}<br />
                    {F("phone", "(555) 555-1234")}<br />
                    {(resume.linkedin || onUpdateField) && F("linkedin", "linkedin 链接")}
                </div>
            </div>

            {order.map((id) => blocks[id]).filter(Boolean)}
        </div>
    );
};

export default SimplePreview;