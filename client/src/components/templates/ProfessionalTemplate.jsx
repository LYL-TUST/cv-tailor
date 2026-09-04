import EditableField from '../editor/EditableField';
import ResumePhotoSlot from './ResumePhotoSlot';

/**
 * 双栏布局 —— 侧栏放联系方式,主区放经历
 *
 * 当 onUpdateField/onUpdateExperience/onUpdateBullet/onUpdateEducation 任一提供时,
 * 字段以 contentEditable 渲染,直接点击修改;否则显示 fallback 占位符(向后兼容 Templates/Download)。
 */
const ProfessionalPreview = ({
  resume,
  settings,
  onUpdateField,
  onUpdateExperience,
  onUpdateBullet,
  onUpdateEducation,
}) => {
    const vis = (id) => settings?.moduleVisible?.[id] !== false;
    // 工厂:有回调时用 EditableField(可编辑),否则走 fallback 占位符(只读)
    const T = (field, placeholder, multiline = false) => onUpdateField
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

    return (
        <div className="resume-card-professional">
            <div className="sidebar">
                <ResumePhotoSlot
                    photo={resume.photo}
                    onUpdate={onUpdateField && ((v) => onUpdateField('photo', v))}
                    size="sidebar"
                />
                <h1 className="editable-block">{T("name", "你的姓名")}</h1>
                <h3 className="editable-block">{T("title", "你的目标职位")}</h3>

                <h4>联系方式</h4>
                <div className="contact-item">📞 <EditableSpan onUpdate={onUpdateField} field="phone" value={resume.phone} placeholder="138-0000-0000" /></div>
                <div className="contact-item">✉️ <EditableSpan onUpdate={onUpdateField} field="email" value={resume.email} placeholder="you@example.com" /></div>
                <div className="contact-item">📍 <EditableSpan onUpdate={onUpdateField} field="location" value={resume.location} placeholder="所在城市" /></div>
                {(resume.linkedin || onUpdateField) && (
                    <div className="contact-item">💼 <EditableSpan onUpdate={onUpdateField} field="linkedin" value={resume.linkedin} placeholder="linkedin.com/in/你的主页" /></div>
                )}

                {vis("summary") && (resume.summary || onUpdateField) && (
                    <>
                        <h4>个人简介</h4>
                        <p className="editable-block" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                            {T("summary", "一句话介绍自己...", true)}
                        </p>
                    </>
                )}
            </div>

            <div className="main-content">
                {vis("experience") && resume.experiences && resume.experiences.some(exp => exp.company || exp.role) && (
                    <>
                        <h4>工作经历</h4>
                        {resume.experiences.map((exp, i) => (
                            (exp.company || exp.role || onUpdateExperience) && (
                                <div key={i} style={{ marginBottom: '20px' }}>
                                    <div className="job-title">{Tx(i, "role", "职位")}</div>
                                    <div className="company">
                                        {Tx(i, "company", "公司")} | {Tx(i, "duration", "时间")}
                                    </div>
                                    <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                                        {exp.bullets.map((bullet, bi) => {
                                            const empty = !bullet.trim();
                                            if (empty && !onUpdateBullet) return null;
                                            return (
                                                <li key={bi} style={{ fontSize: '12px', lineHeight: '1.5', marginBottom: '4px' }}>
                                                    {Tb(i, bi, bullet)}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )
                        ))}
                    </>
                )}

                {vis("education") && resume.education && resume.education.some(edu => edu.school || edu.degree) && (
                    <>
                        <h4 style={{ marginTop: '24px' }}>EDUCATION</h4>
                        {resume.education.map((edu, i) => (
                            (edu.school || edu.degree || onUpdateEducation) && (
                                <div key={i} style={{ marginBottom: '12px' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                                        {Ed(i, "degree", "学历")} {Ed(i, "field", "专业")}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                        {Ed(i, "school", "学校")} | {Ed(i, "graduationYear", "毕业年份")}
                                    </div>
                                </div>
                            )
                        ))}
                    </>
                )}

                {vis("skills") && (resume.skills || onUpdateField) && (
                    <>
                        <h4 style={{ marginTop: '24px' }}>SKILLS</h4>
                        <p className="editable-block" style={{ fontSize: '12px' }}>
                            {T("skills", "技能用逗号分隔", true)}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

// inline 简化封装:有回调时 EditableField,否则纯文本
function EditableSpan({ onUpdate, field, value, placeholder }) {
    if (!onUpdate) return <>{value || placeholder}</>;
    return (
        <EditableField
            value={value ?? ''}
            onChange={(v) => onUpdate(field, v)}
            placeholder={placeholder}
        />
    );
}

export default ProfessionalPreview;