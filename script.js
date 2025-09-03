document.addEventListener('DOMContentLoaded', () => {
    const character = document.getElementById('character');
    const chatContainer = document.getElementById('chat-container');
    const closeChatButton = document.getElementById('close-chat');
    const sendButton = document.getElementById('send-button');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    // 캐릭터를 클릭하면 채팅창을 보여줍니다.
    character.addEventListener('click', () => {
        chatContainer.classList.remove('hidden');
    });

    // 닫기 버튼을 클릭하면 채팅창을 숨깁니다.
    closeChatButton.addEventListener('click', () => {
        chatContainer.classList.add('hidden');
    });

    // 전송 버튼을 클릭하면 메시지를 추가합니다.
    sendButton.addEventListener('click', () => {
        sendMessage();
    });

    // Enter 키를 눌러도 메시지를 전송합니다.
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    async function sendMessage() {
        const messageText = chatInput.value.trim();
        if (messageText === '') {
            return;
        }

        addMessage(messageText, 'user');
        chatInput.value = '';

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: messageText }),
            });

            if (!response.ok) {
                throw new Error('서버에 문제가 발생했습니다.');
            }

            const data = await response.json();
            addMessage(data.reply, 'bot');
        } catch (error) {
            console.error('Error:', error);
            addMessage('죄송합니다, 응답을 받아오는 데 실패했습니다.', 'bot');
        }
    }

    function addMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        messageElement.textContent = text;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; // 새 메시지로 스크롤
    }
});
