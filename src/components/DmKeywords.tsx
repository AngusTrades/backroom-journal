"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteKeyword, saveKeyword, setKeywordActive, type KeywordInput } from "@/app/actions/dm-replies";
import { MAX_REPLY_BYTES, byteLength, matchKeyword, normalizeKeyword } from "@/lib/dmKeywords";

export type KeywordRow = {
  id: string;
  keyword: string;
  reply: string;
  onDm: boolean;
  onComment: boolean;
  publicCommentReply: string | null;
  active: boolean;
  useCount: number;
};

const EMPTY: KeywordInput = { keyword: "", reply: "", onDm: true, onComment: true, publicCommentReply: "" };

function KeywordForm({
  initial,
  onDone,
  submitLabel,
}: {
  initial: KeywordInput;
  onDone: () => void;
  submitLabel: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<KeywordInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bytes = byteLength(v.reply);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveKeyword(v);
      if (res.error) setError(res.error);
      else {
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <div className="dm-form">
      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        <div className="field">
          <label>Keyword</label>
          <input
            type="text"
            value={v.keyword}
            maxLength={60}
            placeholder="CHALLENGE"
            onChange={(e) => setV({ ...v, keyword: e.target.value })}
            className="mono"
          />
          {v.keyword && normalizeKeyword(v.keyword) !== v.keyword && (
            <div className="sub">Matches as: {normalizeKeyword(v.keyword) || "—"}</div>
          )}
        </div>
        <div className="field">
          <label>
            Reply they get in DMs{" "}
            <span className={`sub ${bytes > MAX_REPLY_BYTES ? "bad" : ""}`}>
              ({bytes}/{MAX_REPLY_BYTES})
            </span>
          </label>
          <textarea
            rows={4}
            value={v.reply}
            placeholder={"Here's everything about the $1K → $100K challenge 👇\nhttps://…"}
            onChange={(e) => setV({ ...v, reply: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4" style={{ marginTop: 10 }}>
        <label className="dm-check">
          <input type="checkbox" checked={v.onDm} onChange={(e) => setV({ ...v, onDm: e.target.checked })} /> When someone DMs
          it
        </label>
        <label className="dm-check">
          <input type="checkbox" checked={v.onComment} onChange={(e) => setV({ ...v, onComment: e.target.checked })} /> When
          someone comments it
        </label>
      </div>
      {v.onComment && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Public reply under the comment (optional)</label>
          <input
            type="text"
            value={v.publicCommentReply}
            maxLength={300}
            placeholder="Sent you a DM 👀"
            onChange={(e) => setV({ ...v, publicCommentReply: e.target.value })}
          />
        </div>
      )}
      {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {submitLabel !== "Add keyword" && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export function DmKeywords({ keywords }: { keywords: KeywordRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [test, setTest] = useState("");
  const [, startTransition] = useTransition();
  const active = keywords.filter((k) => k.active);
  const testDm = test ? matchKeyword(test, active.filter((k) => k.onDm)) : null;
  const testComment = test ? matchKeyword(test, active.filter((k) => k.onComment)) : null;

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Add a keyword</h3>
        <div className="sub" style={{ marginBottom: 10 }}>
          Triggers only when the whole message is the keyword. Capitals, punctuation and emoji are ignored, so
          &quot;challenge!&quot; counts but &quot;is the challenge still open?&quot; doesn&apos;t, and you answer that one yourself.
        </div>
        <KeywordForm key={formKey} initial={EMPTY} submitLabel="Add keyword" onDone={() => setFormKey((k) => k + 1)} />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Your keywords</h3>
        {keywords.length === 0 ? (
          <div className="sub">None yet. Add CHALLENGE and BACKROOMS above to start.</div>
        ) : (
          <div className="dm-list">
            {keywords.map((k) =>
              editing === k.id ? (
                <KeywordForm
                  key={k.id}
                  submitLabel="Save"
                  initial={{
                    id: k.id,
                    keyword: k.keyword,
                    reply: k.reply,
                    onDm: k.onDm,
                    onComment: k.onComment,
                    publicCommentReply: k.publicCommentReply ?? "",
                  }}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <div key={k.id} className={`dm-row ${k.active ? "" : "paused"}`}>
                  <div className="dm-row-head">
                    <span className="mono dm-kw">{k.keyword}</span>
                    <span className="sub">
                      {[k.onDm && "DMs", k.onComment && "comments"].filter(Boolean).join(" + ")} · used {k.useCount}×
                      {!k.active && " · paused"}
                    </span>
                    <div className="flex gap-2" style={{ marginLeft: "auto" }}>
                      <button type="button" className="btn btn-ghost" onClick={() => setEditing(k.id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          startTransition(async () => {
                            await setKeywordActive(k.id, !k.active);
                            router.refresh();
                          })
                        }
                      >
                        {k.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          if (!window.confirm(`Delete the ${k.keyword} auto-reply?`)) return;
                          startTransition(async () => {
                            await deleteKeyword(k.id);
                            router.refresh();
                          });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="dm-reply">{k.reply}</div>
                  {k.onComment && k.publicCommentReply && (
                    <div className="sub">Public comment reply: {k.publicCommentReply}</div>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Test a message</h3>
        <div className="field">
          <input type="text" value={test} onChange={(e) => setTest(e.target.value)} placeholder='Type what someone might send, e.g. "Challenge!"' />
        </div>
        {test && (
          <div className="sub" style={{ marginTop: 8 }}>
            As a DM: {testDm ? <strong className="good">replies with {testDm.keyword}</strong> : "no auto-reply"} · As a
            comment: {testComment ? <strong className="good">replies with {testComment.keyword}</strong> : "no auto-reply"}
          </div>
        )}
      </div>
    </>
  );
}
