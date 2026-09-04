import PageHead from "../components/PageHead";
import { useState } from "react";
import * as api from "../utils/api";
import { track } from "../utils/analytics";
import { saveInterviewSession } from "../utils/historyStore";

export default function Interview() {
  const [jobTitle, setJobTitle] = useState("");
  const [interviewType, setInterviewType] = useState("mixed");
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionRecords, setSessionRecords] = useState([]); // 本次练习已完成的 Q&A
  const [sessionSaved, setSessionSaved] = useState(false);

  const generateQuestions = async () => {
    if (!jobTitle.trim()) {
      setError("请输入目标职位");
      return;
    }

    setLoading(true);
    setError(null);
    setQuestions([]);
    setEvaluation(null);
    setSessionRecords([]);
    setSessionSaved(false);

    try {
      const result = await api.generateInterviewQuestions({
        jobTitle,
        interviewType,
        count: 5,
      });

      setQuestions(result.questions || []);
      setCurrentQuestionIndex(0);
    } catch (err) {
      setError(`生成面试题失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const evaluateUserAnswer = async () => {
    if (!userAnswer.trim()) {
      setError("请先写下你的回答");
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    setLoading(true);
    setError(null);

    try {
      const result = await api.evaluateAnswer({
        question: currentQuestion.question,
        userAnswer,
        questionType: currentQuestion.type,
      });

      setEvaluation(result);
      // 汇总到本次会话记录（同一题重答则覆盖旧记录）
      setSessionRecords((prev) => {
        const others = prev.filter((r) => r.question !== currentQuestion.question);
        return [...others, {
          type: currentQuestion.type || "",
          category: currentQuestion.category || "",
          question: currentQuestion.question || "",
          userAnswer,
          score: result.score ?? null,
          feedback: result.feedback || "",
          strengths: result.strengths || [],
          improvements: result.improvements || [],
          starCompliance: result.starCompliance,
          improvedAnswer: result.improvedAnswer || "",
        }];
      });
      setSessionSaved(false);
    } catch (err) {
      setError(`回答评估失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /** 保存本次练习到个人中心历史 */
  const saveSession = () => {
    if (sessionRecords.length === 0) {
      setError("还没有已评估的回答，请先完成至少一题再保存");
      return;
    }
    const session = saveInterviewSession({
      jobTitle,
      interviewType,
      records: sessionRecords,
    });
    setSessionSaved(true);
    setError(null);
    track("interview_history_save", { questions: session.questionCount });
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setUserAnswer("");
      setEvaluation(null);
    }
  };

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setUserAnswer("");
      setEvaluation(null);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <section>
      <PageHead
        kicker="打磨优化"
        title="模拟面试"
        icon="🎤"
        sub="按目标岗位练习面试问答，并获得 AI 逐条反馈。"
      />

      {/* Setup Form */}
      <div style={{ marginBottom: '24px', padding: '20px', background: '#f8f9fa', borderRadius: '8px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          目标职位
        </label>
        <input
          type="text"
          placeholder="例如：AI 产品经理、数据分析师"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            marginBottom: '16px',
          }}
        />

        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          题目类型
        </label>
        <select
          value={interviewType}
          onChange={(e) => setInterviewType(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            marginBottom: '16px',
          }}
        >
          <option value="mixed">混合（行为面 + 技术面）</option>
          <option value="behavioral">仅行为面</option>
          <option value="technical">仅技术面</option>
        </select>

        <button
          className="btn-primary"
          onClick={generateQuestions}
          disabled={loading || !jobTitle.trim()}
        >
          {loading ? '正在生成题目...' : '生成面试题'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee',
          color: '#c33',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {/* Questions Display */}
      {questions.length > 0 && currentQuestion && (
        <div>
          {/* 保存到个人中心 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
            marginBottom: '12px', padding: '10px 14px', background: '#f0fdf4',
            border: '1px solid #bbf7d0', borderRadius: '8px',
          }}>
            <span style={{ fontSize: '13px', color: '#166534' }}>
              已答 {sessionRecords.length} 题{sessionSaved && ' · ✅ 已保存到个人中心'}
            </span>
            <button
              className="btn-ghost"
              onClick={saveSession}
              disabled={sessionRecords.length === 0 || sessionSaved}
              style={{ marginLeft: 'auto', fontSize: '13px', padding: '5px 12px' }}
            >
              💾 保存本次练习
            </button>
          </div>

          {/* 题目导航 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              第 {currentQuestionIndex + 1} / {questions.length}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-ghost"
                onClick={previousQuestion}
                disabled={currentQuestionIndex === 0}
              >
                ← 上一题
              </button>
              <button
                className="btn-ghost"
                onClick={nextQuestion}
                disabled={currentQuestionIndex === questions.length - 1}
              >
                下一题 →
              </button>
            </div>
          </div>

          {/* Current 第 */}
          <div className="interview-card" style={{
            padding: '20px',
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '12px',
            marginBottom: '20px',
          }}>
            <div style={{
              display: 'inline-block',
              padding: '4px 12px',
              background: currentQuestion.type === 'behavioral' ? '#e3f2fd' : '#fff3e0',
              color: currentQuestion.type === 'behavioral' ? '#1976d2' : '#f57c00',
              borderRadius: '16px',
              fontSize: '12px',
              fontWeight: '500',
              marginBottom: '12px',
            }}>
              {currentQuestion.type || '综合'} • {currentQuestion.category || '面试题'}
            </div>

            <p style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
              <strong>问：</strong> {currentQuestion.question}
            </p>

            {currentQuestion.answerFramework && (
              <p className="muted" style={{ fontSize: '14px', color: '#666' }}>
                💡 建议用 {currentQuestion.answerFramework} 结构组织你的回答
              </p>
            )}
          </div>

          {/* Answer Input */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              你的回答
            </label>
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="在此输入你的回答..."
              rows={6}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                fontSize: '15px',
                fontFamily: 'inherit',
              }}
            />
            <button
              className="btn-primary"
              onClick={evaluateUserAnswer}
              disabled={loading || !userAnswer.trim()}
              style={{ marginTop: '12px' }}
            >
              {loading ? '正在评估...' : '获取 AI 反馈'}
            </button>
          </div>

          {/* Evaluation Results */}
          {evaluation && (
            <div style={{
              padding: '20px',
              background: '#f1f8f4',
              borderRadius: '12px',
              border: '1px solid #4CAF50',
            }}>
              <h4 style={{ fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📊 评估得分：
                <strong style={{
                  color: evaluation.score >= 7 ? '#4CAF50' : evaluation.score >= 5 ? '#FF9800' : '#f44336',
                  fontSize: '24px',
                }}>
                  {evaluation.score}/10
                </strong>
              </h4>

              <div style={{ marginBottom: '16px' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>整体反馈：</strong>
                <p style={{ color: '#333' }}>{evaluation.feedback}</p>
              </div>

              {evaluation.strengths && evaluation.strengths.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#4CAF50' }}>
                    ✅ 回答亮点：
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {evaluation.strengths.map((strength, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{strength}</li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.improvements && evaluation.improvements.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#f57c00' }}>
                    💡 待改进之处：
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {evaluation.improvements.map((improvement, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{improvement}</li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.starCompliance !== undefined && (
                <div style={{
                  padding: '12px',
                  background: evaluation.starCompliance ? '#d4edda' : '#fff3cd',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}>
                  <strong>STAR 结构符合度：</strong>{' '}
                  {evaluation.starCompliance ? '✅ 符合' : '⚠️ 可再加强'}
                </div>
              )}

              {evaluation.improvedAnswer && (
                <div>
                  <strong style={{ display: 'block', marginBottom: '8px' }}>
                    🌟 参考答案示例：
                  </strong>
                  <p style={{
                    padding: '12px',
                    background: '#fff',
                    borderRadius: '8px',
                    fontStyle: 'italic',
                  }}>
                    {evaluation.improvedAnswer}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {questions.length === 0 && !loading && (
        <div className="empty-state">
          <p>输入目标职位并点击「生成面试题」开始练习。</p>
        </div>
      )}
    </section>
  );
}
