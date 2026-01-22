export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ 
        margin: 0, 
        backgroundColor: '#f8fafc', 
        fontFamily: "'Inter', sans-serif",
        color: '#1e293b',
        WebkitTapHighlightColor: 'transparent'
      }}>
        {children}
      </body>
    </html>
  );
}