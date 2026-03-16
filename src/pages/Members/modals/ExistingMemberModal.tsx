import Modal from '../components/Modal';

type Props = {
  onClose: () => void;
};

export default function ExistingMemberModal({ onClose }: Props) {
  return (
    <Modal onClose={onClose} title="Ενημέρωση">
      <div className="text-sm text-text-secondary leading-relaxed">
        Υπάρχει ήδη εγγεγραμμένο μέλος σε άλλο γυμναστήριο με αυτό το email, οπότε ο κωδικός του παραμένει ο ίδιος και δεν είναι αυτός που μόλις καταχωρήσατε.
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-primary" onClick={onClose}>Εντάξει</button>
      </div>
    </Modal>
  );
}
