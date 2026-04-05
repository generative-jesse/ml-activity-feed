import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RaffleML — AI Activity Feed Monitor',
  description: 'Paste any activity feed URL, get instant AI insights, and generate production-ready ML analysis scripts.',
  keywords: ['activity feed', 'machine learning', 'anomaly detection', 'sentiment analysis', 'time series'],
  openGraph: {
    title: 'RaffleML — AI Activity Feed Monitor',
    description: 'Monitor any feed, get AI insights, generate ML scripts.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-bg antialiased">
        {children}
      </body>
    </html>
  )
}
