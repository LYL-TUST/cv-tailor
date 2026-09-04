
import React from 'react';

const StylishPreview = ({ resume }) => (
    <div className="resume-card-stylish">
        <div className="header-bar">
            <h1>{resume.name || "你的姓名"}</h1>
            <h3>{resume.title || "你的目标职位"}</h3>
        </div>

        <div className="content-area">
            <div className="left-column">
                <h4>联系方式</h4>
                <div className="contact-item">📞 {resume.phone || "138-0000-0000"}</div>
                <div className="contact-item">✉️ {resume.email || "you@example.com"}</div>
                <div className="contact-item">📍 {resume.location || "所在城市"}</div>
                {resume.linkedin && <div className="contact-item">💼 {resume.linkedin}</div>}

                {resume.education && resume.education.some(edu => edu.school || edu.degree) && (
                    <>
                        <h4>教育背景</h4>
                        {resume.education.map((edu, i) => (
                            (edu.school || edu.degree) && (
                                <div key={i} style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#2C3E50' }}>{edu.degree} / {edu.field}</div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>{edu.school}</div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>{edu.graduationYear}</div>
                                </div>
                            )
                        ))}
                    </>
                )}

                {resume.skills && (
                    <>
                        <h4>技能</h4>
                        <ul style={{ paddingLeft: '16px' }}>
                            {(resume.skills || "").split(',').map((skill, i) => (
                                skill.trim() && <li key={i} style={{ fontSize: '11px', marginBottom: '4px' }}>{skill.trim()}</li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

            <div className="right-column">
                {resume.summary && (
                    <>
                        <h4>个人简介</h4>
                        <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#444' }}>
                            {resume.summary}
                        </p>
                    </>
                )}

                {resume.experiences && resume.experiences.some(exp => exp.company || exp.role) && (
                    <>
                        <h4>工作经历</h4>
                        {resume.experiences.map((exp, i) => (
                            (exp.company || exp.role) && (
                                <div key={i} style={{ marginBottom: '20px' }}>
                                    <div className="job-title">{exp.role || "职位"}</div>
                                    <div className="company">{exp.company || "公司名称"} | {exp.duration || "时间"}</div>
                                    <ul>
                                        {exp.bullets.filter(b => b.trim()).map((bullet, bi) => (
                                            <li key={bi}>{bullet}</li>
                                        ))}
                                    </ul>
                                </div>
                            )
                        ))}
                    </>
                )}
            </div>
        </div>
    </div>
);

export default StylishPreview;
