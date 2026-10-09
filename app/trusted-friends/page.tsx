"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, Trash2, UserPlus } from "lucide-react";
import { Eyebrow, PageTitle, EmptyState } from "@/components/ui/Page";
import { Button } from "@/components/ui/Button";
import type { TrustedFriendRecord } from "@/lib/state/mockDatabase";

export default function TrustedFriendsPage() {
  const [friends, setFriends] = useState<TrustedFriendRecord[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/trusted-friends");
        const data = await res.json();
        if (cancelled || !data.success) return;
        setFriends(data.friends);
        setEnabled(data.enabled);
      } catch (err) {
        console.error("Could not load Trusted Friends:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/trusted-friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "We could not send that invitation.");
        return;
      }
      setEmail("");
      setName("");
      setAdding(false);
      reload();
    } catch {
      setError("We could not send that invitation. Please try again.");
    }
  };

  const remove = async (friend: TrustedFriendRecord) => {
    if (!window.confirm(`Remove ${friend.name}? They will no longer be able to confirm you are well.`)) {
      return;
    }
    await fetch(`/api/trusted-friends?id=${encodeURIComponent(friend.id)}`, { method: "DELETE" });
    reload();
  };

  const copyLink = async (friend: TrustedFriendRecord) => {
    const link = `${window.location.origin}/trusted-friends/accept/${friend.inviteToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(friend.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copy this invitation link and send it to them:", link);
    }
  };

  const setEnabledOnServer = async (next: boolean) => {
    setEnabled(next);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trustedFriendsEnabled: next }),
    });
  };

  const accepted = friends.filter((f) => f.status === "Accepted").length;

  return (
    <div className="pb-12">
      <Eyebrow>Trusted Friends</Eyebrow>
      <PageTitle>Trusted Friends</PageTitle>

      <p className="mb-6 text-[17px] leading-relaxed text-[var(--text-muted)]">
        A Trusted Friend is someone who can confirm you are well if you stop answering our
        check-ins. Invite at least one person — we suggest two. Each person has to accept before
        they count, and their box turns green once they have.
      </p>

      {loading ? (
        <p className="py-10 text-center text-[17px] text-[var(--text-muted)]">Loading…</p>
      ) : friends.length === 0 && !adding ? (
        <EmptyState
          title="You have not invited anyone yet"
          body="Nothing happens until someone accepts, so there is no harm in asking two people."
          action={
            <Button size="lg" onClick={() => setAdding(true)}>
              <UserPlus className="h-5 w-5" aria-hidden="true" />
              Invite someone
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {friends.map((friend) => {
            const isAccepted = friend.status === "Accepted";
            return (
              <li
                key={friend.id}
                className={`rounded-[16px] border p-4 ${
                  isAccepted
                    ? "border-[#b6ddc8] bg-[var(--success-soft)]"
                    : "border-[var(--border)] bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[19px] font-bold leading-snug text-[var(--text)]">
                      {friend.name}
                    </p>
                    <p className="truncate text-[16px] text-[var(--text-muted)]">{friend.email}</p>
                    <p
                      className={`mt-1.5 inline-flex items-center gap-1.5 text-[15px] font-semibold ${
                        isAccepted ? "text-[var(--success)]" : "text-[var(--marigold)]"
                      }`}
                    >
                      {isAccepted && <Check className="h-4 w-4" aria-hidden="true" />}
                      {isAccepted ? "Accepted" : "Waiting for them to accept"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(friend)}
                    aria-label={`Remove ${friend.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-white hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                {!isAccepted && (
                  <Button
                    variant="secondary"
                    onClick={() => copyLink(friend)}
                    className="mt-3 w-full"
                  >
                    {copiedId === friend.id ? (
                      <>
                        <Check className="h-5 w-5" aria-hidden="true" />
                        Link copied — send it to them
                      </>
                    ) : (
                      <>
                        <Copy className="h-5 w-5" aria-hidden="true" />
                        Copy invitation link
                      </>
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <form
          onSubmit={invite}
          className="mt-4 space-y-3 rounded-[16px] border border-[var(--border-strong)] bg-white p-4"
        >
          <div>
            <label htmlFor="tf-name" className="mb-1.5 block text-[15px] font-semibold text-[var(--action)]">
              Their name
            </label>
            <input
              id="tf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example, Meera"
              className="min-h-[56px] w-full rounded-[12px] border border-[var(--border-strong)] px-4 text-[18px] outline-none focus:border-[var(--action)]"
            />
          </div>
          <div>
            <label htmlFor="tf-email" className="mb-1.5 block text-[15px] font-semibold text-[var(--action)]">
              Their email address
            </label>
            <input
              id="tf-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="min-h-[56px] w-full rounded-[12px] border border-[var(--border-strong)] px-4 text-[18px] outline-none focus:border-[var(--action)]"
            />
          </div>
          {error && (
            <p role="alert" className="text-[16px] text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="quiet" onClick={() => setAdding(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Create invitation
            </Button>
          </div>
        </form>
      )}

      {!adding && friends.length > 0 && (
        <Button variant="secondary" onClick={() => setAdding(true)} className="mt-4 w-full">
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add more
        </Button>
      )}

      <div className="mt-10 border-t border-[var(--border)] pt-6">
        <p className="mb-3 text-[17px] leading-relaxed text-[var(--text-muted)]">
          {enabled
            ? "If you would rather not use Trusted Friends, you can turn the feature off. You can switch it back on at any time — it starts working again once at least one person has accepted."
            : "Trusted Friends is turned off. Nobody will be asked to confirm your wellbeing."}
        </p>
        <Button
          variant={enabled ? "danger" : "secondary"}
          onClick={() => setEnabledOnServer(!enabled)}
          className="w-full"
        >
          {enabled ? "Turn off Trusted Friends" : "Turn Trusted Friends back on"}
        </Button>
        {enabled && accepted === 0 && friends.length > 0 && (
          <p className="mt-3 text-[16px] text-[var(--marigold)]">
            Nobody has accepted yet, so Trusted Friends is not protecting you.
          </p>
        )}
      </div>
    </div>
  );
}
