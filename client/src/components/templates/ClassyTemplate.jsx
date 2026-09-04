
import React from 'react';

const ClassyPreview = ({ resume }) => (
    <div className="resume-card-classy">
        <h1>{resume.name || "你的姓名"}</h1>
        <div className="contact-line">
            {resume.phone || "138-0000-0000"} | {resume.email || "you@example.com"} | {resume.location || "所在城市"} {resume.linkedin && `| ${resume.linkedin}`}
        </div>

        {resume.summary && (
            <>
                <h4>个人简介</h4>
                <p>{resume.summary}</p>
            </>
        )}

        {resume.experiences && resume.experiences.some(exp => exp.company || exp.role) && (
            <>
                <h4>工作经历</h4>
                {resume.experiences.map((exp, i) => (
                    (exp.company || exp.role) && (
                        <div key={i} style={{ marginBottom: '20px' }}>
                            <div>
                                <span className="job-title">{exp.role || "职位"}</span>
                                <span className="date" style={{ float: 'right' }}>{exp.duration || "时间"}</span>
                            </div>
                            <div className="company">{exp.company || "公司名称"}</div>
                            <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                                {exp.bullets.filter(b => b.trim()).map((bullet, bi) => (
                                    <li key={bi}>{bullet}</li>
                                ))}
                            </ul>
                        </div>
                    )
                ))}
            </>
        )}

        {resume.education && resume.education.some(edu => edu.school || edu.degree) && (
            <>
                <h4>教育背景</h4>
                {resume.education.map((edu, i) => (
                    (edu.school || edu.degree) && (
                        <div key={i} style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{edu.school}</div>
                                <div>{edu.degree} {edu.field}</div>
                            </div>
                            <div>{edu.graduationYear}</div>
                        </div>
                    )
                ))}
            </>
        )}

        {resume.skills && (
            <>
                <h4>技能</h4>
                <p>{resume.skills}</p>
            </>
        )}
    </div>
);

export default ClassyPreview;
