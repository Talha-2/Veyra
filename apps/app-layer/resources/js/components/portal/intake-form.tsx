import { router, useForm } from '@inertiajs/react';
import Sidebar from '../ui/sidebar';
export type PortalQuestionnaire = { id: number; title: string; questions: string[] };
export default function PortalIntakeForm({ accessId, questionnaire, close }: { accessId: number; questionnaire: PortalQuestionnaire; close: () => void }) {
    const form = useForm({ questionnaire_id: questionnaire.id, expected_title: questionnaire.title, expected_questions: questionnaire.questions, answers: questionnaire.questions.map(() => '') });
    return <Sidebar open title={questionnaire.title} description="These answers are patient reported. Your practice can review them; they do not change your signed consultation notes." onClose={() => { if (!form.processing) close(); }}>
        <form onSubmit={event => { event.preventDefault(); form.post('/portal/patients/' + accessId + '/questionnaires', { preserveScroll: true, onSuccess: close }); }}><fieldset disabled={form.processing} className="space-y-5">
            {questionnaire.questions.map((question, index) => <label key={index} className="block text-sm">{question}<textarea required rows={3} maxLength={10000} className="v-field mt-2 w-full" value={form.data.answers[index]} onChange={event => form.setData('answers', form.data.answers.map((answer, i) => i === index ? event.target.value : answer))} /></label>)}
            {Object.values(form.errors).map((error, index) => <p key={index} className="text-sm text-danger" role="alert">{error}</p>)}
            <div className="flex flex-wrap gap-3"><button disabled={form.processing} className="v-btn v-btn--primary">{form.processing ? 'Submitting…' : 'Submit answers to practice'}</button>{form.errors.questionnaire_id && <button type="button" className="v-btn v-btn--ghost" onClick={() => { close(); router.reload({ only: ['questionnaires'] }); }}>Reload questionnaires</button>}</div>
        </fieldset></form>
    </Sidebar>;
}
