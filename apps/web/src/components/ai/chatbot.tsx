"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, X, Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { aiApi } from "@/lib/api";

interface Message {
  id: string;
  content: string;
  sender: "user" | "bot";
  timestamp: Date;
  type?: string;
}

const SUGGESTED_QUESTIONS = [
  "How many leads today?",
  "How many site visits this month?",
  "Show lead status",
  "Show sales performance",
  "Show unit availability",
];

const CHATBOT_POSITION_KEY = "dct-crm-chatbot-position";
const CHATBOT_EDGE = 8;

type ChatbotOffset = { right: number; bottom: number };

function readStoredChatbotPosition(): ChatbotOffset | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CHATBOT_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatbotOffset>;
    if (typeof parsed.right === "number" && typeof parsed.bottom === "number") {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch {
    return null;
  }
  return null;
}

export function Chatbot() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
        content: "Hello! I'm your DCT AI Assistant. You can ask me about leads, site visits, projects, reports and dashboards.",
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [position, setPosition] = React.useState<ChatbotOffset>({ right: 16, bottom: 16 });
  const [positionReady, setPositionReady] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const suppressClickRef = React.useRef(false);
  const positionRef = React.useRef(position);
  positionRef.current = position;

  const clampPosition = React.useCallback((next: ChatbotOffset): ChatbotOffset => {
    const width = containerRef.current?.offsetWidth || 96;
    const height = containerRef.current?.offsetHeight || 80;
    const maxRight = Math.max(CHATBOT_EDGE, window.innerWidth - width - CHATBOT_EDGE);
    const maxBottom = Math.max(CHATBOT_EDGE, window.innerHeight - height - CHATBOT_EDGE);
    return {
      right: Math.min(maxRight, Math.max(CHATBOT_EDGE, next.right)),
      bottom: Math.min(maxBottom, Math.max(CHATBOT_EDGE, next.bottom)),
    };
  }, []);

  React.useEffect(() => {
    const stored = readStoredChatbotPosition();
    if (stored) setPosition(clampPosition(stored));
    setPositionReady(true);
  }, [clampPosition]);

  React.useEffect(() => {
    if (!positionReady || !window.localStorage) return;
    window.localStorage.setItem(CHATBOT_POSITION_KEY, JSON.stringify(position));
  }, [position, positionReady]);

  React.useEffect(() => {
    const onResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampPosition]);

  React.useEffect(() => {
    if (!positionReady) return;
    setPosition((current) => clampPosition(current));
  }, [isOpen, positionReady, clampPosition]);

  const beginDrag = (event: React.PointerEvent<HTMLElement>, toggleOnRelease = false) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = positionRef.current;
    let moved = false;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      moveEvent.preventDefault();
      setDragging(true);
      setPosition(clampPosition({ right: origin.right - dx, bottom: origin.bottom - dy }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      suppressClickRef.current = true;
      if (!moved && toggleOnRelease) setIsOpen((open) => !open);
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (text?: string) => {
    const messageText = text || message.trim();
    if (!messageText) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsTyping(true);
    setError(null);

    try {
      const response = await aiApi.chat(messageText, conversationId || undefined);
      const result = response.data;

      if (result.success && result.data) {
        const aiData = result.data;
        if (aiData.conversationId && !conversationId) {
          setConversationId(aiData.conversationId);
        }
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: aiData.response || aiData.assistantMessage?.content || "I couldn't process that request.",
          sender: "bot",
          timestamp: new Date(),
          type: aiData.responseType || "text",
        };
        setMessages((prev) => [...prev, botMessage]);
      } else {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: result.error || "Something went wrong. Please try again.",
          sender: "bot",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (err: any) {
      console.error("AI chat error:", err);
      let errorMessage = "AI Assistant is temporarily unavailable. Please try again shortly.";
      if (err.response?.status === 401) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (err.response?.status === 403) {
        errorMessage = "You don't have permission to access this information.";
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      }
      setError(errorMessage);
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([
      {
        id: "welcome",
        content: "Hello! I'm your DCT AI Assistant. You can ask me about leads, site visits, projects, reports and dashboards.",
        sender: "bot",
        timestamp: new Date(),
      },
    ]);
    setConversationId(null);
    setError(null);
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-50 touch-none"
      style={{ right: position.right, bottom: position.bottom }}
    >
      {isOpen && (
        <Card className="mb-4 w-[min(24rem,calc(100vw-2rem))] border shadow-xl">
          <CardHeader
            className={cn(
              "flex cursor-grab touch-none flex-row items-center justify-between border-b p-4 active:cursor-grabbing",
              dragging && "cursor-grabbing",
            )}
            title="Drag to move"
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button, input, textarea, a")) return;
              beginDrag(event);
            }}
          >
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm font-semibold">DCT AI Assistant</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewConversation}
                className="h-8 w-8"
                title="New conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-96 px-4" ref={scrollRef}>
              <div className="space-y-4 py-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2",
                      msg.sender === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.sender === "bot" && (
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          AI
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        "rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap",
                        msg.sender === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {msg.content}
                    </div>
                    {msg.sender === "user" && (
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-xs">
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-2">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        AI
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                {messages.length <= 1 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground px-1">Suggested questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <Button
                          key={q}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleSend(q)}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-4 border-t">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  placeholder="Ask about leads, site visits, projects..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1"
                  disabled={isTyping}
                />
                <Button type="submit" size="icon" disabled={!message.trim() || isTyping}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
      <button
        type="button"
        aria-label={isOpen ? "Close chat" : "Open chat"}
        title="Drag to move"
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => beginDrag(event, true)}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setIsOpen((open) => !open);
        }}
        className={cn(
          "ml-auto flex h-20 w-24 cursor-grab touch-none items-center justify-center rounded-2xl active:cursor-grabbing",
          dragging ? "cursor-grabbing" : "transition-transform hover:scale-105",
        )}
      >
        {isOpen ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <X className="h-6 w-6" />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/live-chatbot.svg"
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full select-none object-contain drop-shadow-lg"
          />
        )}
      </button>
    </div>
  );
}
