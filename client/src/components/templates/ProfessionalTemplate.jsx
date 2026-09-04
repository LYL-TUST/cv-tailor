
import React from 'react';

const ProfessionalPreview = ({ resume }) => (
    <div className="resume-card-professional">
        <div className="sidebar">
            <h1>{resume.name || "你的姓名"}</h1>
            <h3>{resume.title || "你的目标职位"}</h3>

            <h4>联系方式</h4>
            <div className="contact-item">📞 {resume.phone || "138-0000-0000"}</div>
            <div className="contact-item">✉️ {resume.email || "you@example.com"}</div>
            <div className="contact-item">📍 {resume.location || "所在城市"}</div>
            {resume.linkedin && <div className="contact-item">💼 {resume.linkedin}</div>}

            {resume.summary && (
                <>
                    <h4>个人简介</h4>
                    <p style={{ fontSize: '12px', lineHeight: '1.6' }}>
                        {resume.summary}
                    </p>
                </>
            )}
        </div>

        <div className="main-content">
            {resume.experiences && resume.experiences.some(exp => exp.company || exp.role) && (
                <>
                    <h4>工作经历</h4>
                    {resume.experiences.map((exp, i) => (
                        (exp.company || exp.role) && (
                            <div key={i} style={{ marginBottom: '20px' }}>
                                <div className="job-title">{exp.role || "职位"}</div>
                                <div className="company">{exp.company || "公司"} | {exp.duration || "时间"}</div>
                                <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                                    {exp.bullets.filter(b => b.trim()).map((bullet, bi) => (
                                        <li key={bi} style={{ fontSize: '12px', lineHeight: '1.5', marginBottom: '4px' }}>{bullet}</li>
                                    ))}
                                </ul>
                            </div>
                        )
                    ))}
                </>
            )}

            {resume.education && resume.education.some(edu => edu.school || edu.degree) && (
                <>
                    <h4 style={{ marginTop: '24px' }}>EDUCATION</h4>
                    {resume.education.map((edu, i) => (
                        (edu.school || edu.degree) && (
                            <div key={i} style={{ marginBottom: '12px' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{edu.degree} {edu.field}</div>
                                <div style={{ fontSize: '12px', color: '#666' }}>{edu.school} | {edu.graduationYear}</div>
                            </div>
                        )
                    ))}
                </>
            )}

            {resume.skills && (
                <>
                    <h4 style={{ marginTop: '24px' }}>SKILLS</h4>
                    <p style={{ fontSize: '12px' }}>{resume.skills}</p>
                </>
            )}
        </div>
    </div>
);

export default ProfessionalPreview;
