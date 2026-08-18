"use client";

import React from "react";
import { EscalationNotification } from "@/lib/state/heartbeatMachine";
import { Mail, MessageSquare, PhoneCall, AlertTriangle } from "lucide-react";

interface EscalationLogProps {
  notifications: EscalationNotification[];
}

export function EscalationLog({ notifications }: EscalationLogProps) {
  if (!notifications || notifications.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-500">
        No active dispatches. System is operating normally.
      </div>
    );
  }

  const getChannelIcon = (channel: string) => {
    switch (channel.toLowerCase()) {
      case "email":
        return <Mail className="w-4 h-4 text-sky-600" />;
      case "sms":
        return <MessageSquare className="w-4 h-4 text-amber-600" />;
      case "whatsapp":
        return <PhoneCall className="w-4 h-4 text-emerald-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-purple-600" />;
    }
  };

  return (
    <div className="space-y-2">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-3 text-xs"
        >
          <div className="p-2 rounded-lg bg-white border border-slate-200 shrink-0 shadow-2xs">
            {getChannelIcon(notif.channel)}
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 capitalize">
                {notif.title}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {new Date(notif.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="text-slate-600 leading-normal">{notif.previewText}</p>
            <span className="text-[10px] text-slate-400 font-mono block">Recipient: {notif.recipient}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
