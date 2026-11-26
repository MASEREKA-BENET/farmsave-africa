"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export function DrawerContent(props:{title:string;description?:string;children:React.ReactNode}) { return <DialogContent {...props} className="left-0 top-0 h-dvh max-h-dvh w-[min(320px,90vw)] max-w-none translate-x-0 translate-y-0 rounded-l-none"/>; }
export function DialogContent({title,description,children,className}:{title:string;description?:string;children:React.ReactNode;className?:string}) { return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" /><DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-8",className)}><DialogPrimitive.Title className="pr-8 text-xl font-bold">{title}</DialogPrimitive.Title><DialogPrimitive.Description className="mb-6 mt-2 text-sm leading-relaxed text-muted-foreground">{description??"Review the details and confirm this action."}</DialogPrimitive.Description>{children}<DialogPrimitive.Close className="absolute right-3 top-3 rounded-lg p-2 hover:bg-muted" aria-label="Close dialog"><X className="size-5" /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>; }
