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
        code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');

            if (!inline && match) {
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
        p: ({ children }: { children?: React.ReactNode }) => (
            <p style={{ marginBottom: '1rem', lineHeight: 1.7 }}>{children}</p>
        ),
        ul: ({ children }: { children?: React.ReactNode }) => (
            <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem', listStyleType: 'disc' }}>{children}</ul>
        ),
        ol: ({ children }: { children?: React.ReactNode }) => (
            <ol style={{ marginBottom: '1rem', paddingLeft: '1.5rem', listStyleType: 'decimal' }}>{children}</ol>
        ),
        li: ({ children }: { children?: React.ReactNode }) => (
            <li style={{ marginBottom: '0.5rem' }}>{children}</li>
        ),
        h1: ({ children }: { children?: React.ReactNode }) => (
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', marginTop: '1.5rem' }}>{children}</h1>
        ),
        h2: ({ children }: { children?: React.ReactNode }) => (
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', marginTop: '1.25rem' }}>{children}</h2>
        ),
        h3: ({ children }: { children?: React.ReactNode }) => (
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1rem' }}>{children}</h3>
        ),
        blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote style={{
                borderLeft: '3px solid var(--accent-primary)',
                paddingLeft: '1rem',
                margin: '1rem 0',
                fontStyle: 'italic',
                opacity: 0.9
            }}>{children}</blockquote>
        ),
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
            >
                {children}
            </a>
        ),
        table: ({ children }: { children?: React.ReactNode }) => (
            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.9rem'
                }}>{children}</table>
            </div>
        ),
        th: ({ children }: { children?: React.ReactNode }) => (
            <th style={{
                padding: '0.75rem',
                borderBottom: '2px solid var(--border-primary)',
                textAlign: 'left',
                fontWeight: 600
            }}>{children}</th>
        ),
        td: ({ children }: { children?: React.ReactNode }) => (
            <td style={{
                padding: '0.75rem',
                borderBottom: '1px solid var(--border-primary)'
            }}>{children}</td>
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
