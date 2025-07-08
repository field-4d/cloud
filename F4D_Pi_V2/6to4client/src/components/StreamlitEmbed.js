import React from 'react';

const StreamlitEmbed = () => {
    const iframeStyle = {
        width: '100%',  // Make the iframe take the full width of its parent
        height: '100%', // Make the iframe take the full height of its parent
        border: 'none'
    };
    const hostname = window.location.hostname;
    const streamlitUrl = `http://${hostname}:8501`;
    // const streamlitUrl = `http://localhost:8501`;


    return (
        <div style={{ height: '100%' }}>
            <iframe
                src={streamlitUrl}
                style={iframeStyle}
                title="Streamlit App"
            ></iframe>
        </div>
    );
};

export default StreamlitEmbed;
