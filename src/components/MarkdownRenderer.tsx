'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import remarkBreaks from 'remark-breaks';

interface MarkdownRendererProps {
    content: string;
    forceNewlines?: boolean;
}

export function MarkdownRenderer({ content, forceNewlines = false }: MarkdownRendererProps) {
    const markdownComponents = useMemo(() => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code({ className, children, node, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');

            if (match) {
                return (
                    <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                            margin: '1rem 0',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                        }}
                        {...props}
                    >
                        {codeString}
                    </SyntaxHighlighter>
                );
            }

            return (
                <code className={`inline-code ${className || ''}`} {...props}>
                    {children}
                </code>
            );
        },
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
            </a>
        ),
        table: ({ children }: { children?: React.ReactNode }) => (
            <div className="table-wrapper">
                <table>{children}</table>
            </div>
        ),
    }), []);

    return (
        <div className="markdown-content">
            <ReactMarkdown
                remarkPlugins={[
                    remarkGfm,
                    ...(forceNewlines ? [remarkBreaks] : [])
                ]}
                rehypePlugins={[rehypeSanitize]}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
